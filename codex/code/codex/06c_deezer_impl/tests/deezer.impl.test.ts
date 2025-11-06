import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import nock from 'nock';

import type { PIF } from '../../../../../packages/contracts/src/index.ts';
import Deezer from '../../../../../packages/providers/deezer/src/index.ts';

import playlistFixture from './fixtures/deezer.playlist.json';
import createdFixture from './fixtures/deezer.created.json';

const baseUrl = 'https://api.deezer.com';

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.useRealTimers();
});

test('importer maps Deezer playlist tracks into PIF', async () => {
  const provider = new Deezer({ token: 'test-token' });

  const playlistId = '1234';

  nock(baseUrl)
    .get(`/playlist/${playlistId}`)
    .reply(200, { title: 'DX', description: 'deezer mix', nb_tracks: 2 })
    .get(`/playlist/${playlistId}/tracks`)
    .query({ limit: '50', index: '0' })
    .reply(200, playlistFixture);

  const result = await provider.readPlaylist(playlistId, { pageSize: 50 });

  expect(result).toMatchObject({
    name: 'DX',
    description: 'deezer mix',
    source_service: 'deezer',
    source_playlist_id: playlistId,
  });
  expect(result.tracks).toHaveLength(2);
  expect(result.tracks[0].isrc).toBe('USABC1200001');
  expect(result.tracks[0]?.provider_ids?.deezer_track_id).toBe('901');
  expect(result.tracks[1].title).toBeTruthy();
});

test('exporter creates playlist then batches track adds with Retry-After respect', async () => {
  vi.useFakeTimers();

  const provider = new Deezer({ token: 'test-token' });
  const playlistId = createdFixture.id;

  const tracks = Array.from({ length: 205 }, (_, i) => ({
    position: i + 1,
    title: `Track ${i + 1}`,
    artists: ['Artist'],
    duration_ms: 180000,
    provider_ids: { deezer_track_id: `dz_${i + 1}` },
  }));

  const pif = {
    name: 'DX out',
    tracks,
  } satisfies PIF;

  nock(baseUrl)
    .post('/user/me/playlists', (body) => body?.title === 'DX out')
    .reply(200, createdFixture);

  const addScope = nock(baseUrl)
    .post(`/playlist/${playlistId}/tracks`, (body) => body?.songs?.length === 100)
    .reply(429, { error: 'rate limit' }, { 'Retry-After': '1' })
    .post(`/playlist/${playlistId}/tracks`, (body) => body?.songs?.length === 100)
    .reply(200, { success: true })
    .post(`/playlist/${playlistId}/tracks`, (body) => body?.songs?.length === 100)
    .reply(200, { success: true })
    .post(`/playlist/${playlistId}/tracks`, (body) => body?.songs?.length === 5)
    .reply(200, { success: true });

  const pending = provider.writePlaylist(pif);

  await vi.advanceTimersByTimeAsync(1000);
  const result = await pending;

  expect(result.destId).toBe(playlistId);
  expect(result.report).toMatchObject({
    attempted: 205,
    added: 205,
    failed: 0,
  });

  expect(addScope.isDone()).toBe(true);
});
