import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import nock from 'nock';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PIF } from '../../../../../packages/contracts/src/index.ts';
import Spotify from '../../../../../packages/providers/spotify/src/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

describe('Spotify provider integration', () => {
  const baseUrl = 'https://api.spotify.com';

  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    vi.useRealTimers();
  });

  test('readPlaylist maps Spotify playlist data into PIF tracks', async () => {
    const playlistId = 'test-playlist';
    const playlist = loadFixture('playlist-metadata.json');
    const pageTwo = loadFixture('playlist-tracks-page-2.json');

    const playlistScope = nock(baseUrl)
      .get(`/v1/playlists/${playlistId}`)
      .query(true)
      .reply(200, playlist);

    const trackPageScope = nock(baseUrl)
      .get(`/v1/playlists/${playlistId}/tracks`)
      .query((qs) => qs.offset === '1' && qs.limit === '1')
      .reply(200, pageTwo);

    const provider = new Spotify({ auth: { token: 'test-token' } });

    const result = await provider.readPlaylist(playlistId, { pageSize: 1 });

    expect(result).toMatchObject({
      name: 'Focus Flow',
      description: 'Deep work background music.',
      source_service: 'spotify',
      source_playlist_id: playlistId,
    });
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toMatchObject({
      position: 1,
      title: 'Deep Dive',
      artists: ['Aurora Lane'],
      album: 'Ocean Patterns',
      duration_ms: 231000,
      explicit: false,
      release_date: '2023-09-01',
      isrc: 'USRC12400001',
      provider_ids: { spotify_track_id: 'track-001' },
    });
    expect(result.tracks[1]).toMatchObject({
      position: 2,
      title: 'Shallow Breath',
      artists: ['Aurora Lane', 'Synthline'],
      album: 'Ocean Patterns',
      duration_ms: 198500,
      explicit: true,
      release_date: '2023',
      isrc: null,
      provider_ids: { spotify_track_id: 'track-002' },
    });

    expect(playlistScope.isDone()).toBe(true);
    expect(trackPageScope.isDone()).toBe(true);
  });

  test('writePlaylist batches adds and retries on rate limits', async () => {
    vi.useFakeTimers();

    const profile = loadFixture('profile.json');
    const created = loadFixture('create-playlist-response.json');
    const addSuccess = loadFixture('add-tracks-success.json');

    const scope = nock(baseUrl)
      .get('/v1/me')
      .reply(200, profile)
      .post('/v1/users/user-123/playlists', (body) => body.name === 'Focus Flow')
      .reply(201, created);

    const addTracksScope = nock(baseUrl)
      .post('/v1/playlists/fresh-playlist-42/tracks', {
        uris: ['spotify:track:track-001', 'spotify:track:track-002'],
      })
      .reply(
        429,
        { error: { status: 429, message: 'Rate limited' } },
        { 'Retry-After': '1' },
      )
      .post('/v1/playlists/fresh-playlist-42/tracks', {
        uris: ['spotify:track:track-001', 'spotify:track:track-002'],
      })
      .reply(201, addSuccess)
      .post('/v1/playlists/fresh-playlist-42/tracks', {
        uris: ['spotify:track:track-003'],
      })
      .reply(201, addSuccess);

    const provider = new Spotify({ auth: { token: 'test-token' } });

    const pif: PIF = {
      name: 'Focus Flow',
      description: 'Deep work background music.',
      source_service: 'spotify',
      source_playlist_id: 'test-playlist',
      tracks: [
        {
          position: 1,
          title: 'Deep Dive',
          artists: ['Aurora Lane'],
          album: 'Ocean Patterns',
          duration_ms: 231000,
          explicit: false,
          release_date: '2023-09-01',
          isrc: 'USRC12400001',
          provider_ids: { spotify_track_id: 'track-001' },
        },
        {
          position: 2,
          title: 'Shallow Breath',
          artists: ['Aurora Lane', 'Synthline'],
          album: 'Ocean Patterns',
          duration_ms: 198500,
          explicit: true,
          release_date: '2023',
          isrc: null,
          provider_ids: { spotify_track_id: 'track-002' },
        },
        {
          position: 3,
          title: 'Edge of Night',
          artists: ['Aurora Lane'],
          album: 'Ocean Patterns',
          duration_ms: 204000,
          explicit: false,
          release_date: '2023',
          isrc: null,
          provider_ids: { spotify_track_id: 'track-003' },
        },
      ],
    };

    const pending = provider.writePlaylist(pif, {
      batch: { batchSize: 2 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result).toEqual({
      destId: 'fresh-playlist-42',
      report: {
        attempted: 3,
        added: 3,
        failed: 0,
      },
    });

    expect(scope.isDone()).toBe(true);
    expect(addTracksScope.isDone()).toBe(true);
  });
});
