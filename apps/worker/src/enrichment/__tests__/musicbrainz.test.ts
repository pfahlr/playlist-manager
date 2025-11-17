import nock from 'nock';
import { expect, test, beforeEach, afterEach, describe } from 'vitest';
import { resolveRecordingMBID } from '../musicbrainz';
import { prisma } from '@app/db';

describe('MusicBrainz enrichment', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.recording_artist.deleteMany({});
    await prisma.recording.deleteMany({});
    await prisma.artist.deleteMany({});
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('picks best match within ±2s', async () => {
    nock('https://musicbrainz.org')
      .get('/ws/2/recording')
      .query(true)
      .reply(200, {
        recordings: [
          {
            id: 'good-uuid-1234',
            title: 'Test Song',
            length: 180000, // 3 minutes
            'artist-credit': [{ name: 'Test Artist', artist: { id: 'artist-uuid-1', name: 'Test Artist' } }],
          },
          {
            id: 'bad-uuid-5678',
            title: 'Test Song',
            length: 250000, // 4:10 - outside ±2s tolerance
            'artist-credit': [{ name: 'Test Artist', artist: { id: 'artist-uuid-2', name: 'Test Artist' } }],
          },
        ],
      });

    const res = await resolveRecordingMBID({
      title: 'Test Song',
      artists: ['Test Artist'],
      duration_ms: 181000, // 3:01 - within ±2s of 180000
    });

    expect(res?.mb_recording_id).toBe('good-uuid-1234');
    expect(res?.mb_artist_ids).toContain('artist-uuid-1');
  });

  test('caches artist mbid and recording mb_recording_id', async () => {
    nock('https://musicbrainz.org')
      .get('/ws/2/recording')
      .query(true)
      .reply(200, {
        recordings: [
          {
            id: 'cached-recording-uuid',
            title: 'Cached Song',
            length: 200000,
            'artist-credit': [
              { name: 'Cached Artist', artist: { id: 'cached-artist-uuid', name: 'Cached Artist' } },
            ],
          },
        ],
      });

    // First call - should hit API
    const firstCall = await resolveRecordingMBID({
      title: 'Cached Song',
      artists: ['Cached Artist'],
      duration_ms: 200000,
    });

    expect(firstCall?.mb_recording_id).toBe('cached-recording-uuid');
    expect(firstCall?.mb_artist_ids).toContain('cached-artist-uuid');

    // Verify cached in database
    const cachedRecording = await prisma.recording.findUnique({
      where: { mb_recording_id: 'cached-recording-uuid' },
    });
    expect(cachedRecording).toBeTruthy();

    const cachedArtist = await prisma.artist.findUnique({
      where: { mbid: 'cached-artist-uuid' },
    });
    expect(cachedArtist).toBeTruthy();

    // Second call - should hit cache (no HTTP)
    // nock will fail if HTTP request is made since we only defined one mock
    const secondCall = await resolveRecordingMBID({
      title: 'Cached Song',
      artists: ['Cached Artist'],
      duration_ms: 200000,
    });

    expect(secondCall?.mb_recording_id).toBe('cached-recording-uuid');
    expect(secondCall?.mb_artist_ids).toContain('cached-artist-uuid');

    // Verify no pending nock mocks (means we didn't make a second HTTP call)
    expect(nock.isDone()).toBe(true);
  });

  test('returns null when no recordings match duration tolerance', async () => {
    nock('https://musicbrainz.org')
      .get('/ws/2/recording')
      .query(true)
      .reply(200, {
        recordings: [
          {
            id: 'far-off-uuid',
            title: 'Far Off Song',
            length: 100000, // 1:40
            'artist-credit': [{ name: 'Some Artist', artist: { id: 'artist-uuid', name: 'Some Artist' } }],
          },
        ],
      });

    const res = await resolveRecordingMBID({
      title: 'Far Off Song',
      artists: ['Some Artist'],
      duration_ms: 300000, // 5:00 - >2s difference
    });

    expect(res).toBeNull();
  });

  test('returns first result when no duration provided', async () => {
    nock('https://musicbrainz.org')
      .get('/ws/2/recording')
      .query(true)
      .reply(200, {
        recordings: [
          {
            id: 'first-uuid',
            title: 'No Duration Song',
            length: 150000,
            'artist-credit': [{ name: 'Artist 1', artist: { id: 'artist-1', name: 'Artist 1' } }],
          },
          {
            id: 'second-uuid',
            title: 'No Duration Song',
            length: 200000,
            'artist-credit': [{ name: 'Artist 2', artist: { id: 'artist-2', name: 'Artist 2' } }],
          },
        ],
      });

    const res = await resolveRecordingMBID({
      title: 'No Duration Song',
      artists: ['Artist 1'],
      // No duration_ms provided
    });

    expect(res?.mb_recording_id).toBe('first-uuid');
  });

  test('handles MusicBrainz API errors gracefully', async () => {
    nock('https://musicbrainz.org')
      .get('/ws/2/recording')
      .query(true)
      .reply(500, { error: 'Internal Server Error' });

    const res = await resolveRecordingMBID({
      title: 'Error Song',
      artists: ['Error Artist'],
      duration_ms: 180000,
    });

    expect(res).toBeNull();
  });

  test('handles empty search results', async () => {
    nock('https://musicbrainz.org')
      .get('/ws/2/recording')
      .query(true)
      .reply(200, {
        recordings: [],
      });

    const res = await resolveRecordingMBID({
      title: 'Nonexistent Song',
      artists: ['Nonexistent Artist'],
      duration_ms: 180000,
    });

    expect(res).toBeNull();
  });
});
