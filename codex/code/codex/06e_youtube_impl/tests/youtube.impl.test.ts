import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import nock from 'nock';

import type { PIF } from '../../../../../packages/contracts/src/index.ts';
import YouTube from '../../../../../packages/providers/youtube/src/index.ts';

import fixture from './fixtures/yt.playlist.json';

const baseUrl = 'https://www.googleapis.com';

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.useRealTimers();
});

test('importer -> PIF basic mapping', async () => {
  const provider = new YouTube({ token: 'fake-token' });

  nock(baseUrl)
    .get('/youtube/v3/playlists')
    .query((query) => query.id === 'PL123')
    .reply(200, fixture.playlist)
    .get('/youtube/v3/playlistItems')
    .query((query) => query.playlistId === 'PL123')
    .reply(200, fixture.playlistItems)
    .get('/youtube/v3/videos')
    .query((query) => query.id === 'vid1,vid2')
    .reply(200, fixture.videos);

  const pif = await provider.readPlaylist('PL123');

  expect(pif).toMatchObject({
    name: 'Sample Mix',
    description: 'demo playlist',
    source_service: 'youtube',
    source_playlist_id: 'PL123',
  });
  expect(pif.tracks).toHaveLength(2);
  expect(pif.tracks[0]).toMatchObject({
    position: 1,
    title: 'Song One (Official Video)',
    artists: ['Artist One'],
    duration_ms: 185000,
    provider_ids: { youtube_video_id: 'vid1' },
  });
  expect(pif.tracks[1]).toMatchObject({
    position: 2,
    title: 'Song Two',
    artists: ['Artist Two'],
    duration_ms: 250000,
    provider_ids: { youtube_video_id: 'vid2' },
  });
});

test('exporter -> create + add videos with cached search', async () => {
  vi.useFakeTimers();

  const provider = new YouTube({ token: 'fake-token' });

  const searchScope = nock(baseUrl)
    .get('/youtube/v3/search')
    .query((query) => query.q?.includes('Song Two Artist Two'))
    .reply(200, {
      items: [
        { id: { videoId: 'search_vid' } },
      ],
    });

  const playlistScope = nock(baseUrl)
    .post('/youtube/v3/playlists')
    .query((query) => query.part === 'snippet')
    .reply(200, { id: 'PLZ' });

  const itemsScope = nock(baseUrl)
    .post('/youtube/v3/playlistItems')
    .query((query) => query.part === 'snippet')
    .reply(200, { status: 'ok' })
    .post('/youtube/v3/playlistItems')
    .query((query) => query.part === 'snippet')
    .reply(200, { status: 'ok' })
    .post('/youtube/v3/playlistItems')
    .query((query) => query.part === 'snippet')
    .reply(200, { status: 'ok' });

  const pif = {
    name: 'YT Out',
    tracks: [
      {
        position: 1,
        title: 'Direct Track',
        artists: ['Artist One'],
        provider_ids: { youtube_video_id: 'vid_direct' },
      },
      {
        position: 2,
        title: 'Song Two',
        artists: ['Artist Two'],
      },
      {
        position: 3,
        title: 'Song Two',
        artists: ['Artist Two'],
      },
    ],
  } satisfies PIF;

  const result = await provider.writePlaylist(pif, { batch: { batchSize: 1 } });

  await vi.runOnlyPendingTimersAsync();

  expect(result.destId).toBe('PLZ');
  expect(result.report).toMatchObject({
    attempted: 3,
    added: 3,
    failed: 0,
  });

  expect(searchScope.isDone()).toBe(true);
  expect(playlistScope.isDone()).toBe(true);
  expect(itemsScope.isDone()).toBe(true);
});
