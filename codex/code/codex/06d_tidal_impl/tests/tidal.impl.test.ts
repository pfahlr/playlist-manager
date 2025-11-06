import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import nock from 'nock';

import Tidal from '../../../../../packages/providers/tidal/src/index.ts';

const baseUrl = 'https://api.tidal.com';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadFixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.useRealTimers();
});

test('importer maps tidal playlist tracks into PIF, preferring track.isrc', async () => {
  const provider = new Tidal({ token: 'test-token' });

  const playlist = loadFixture('tidal.playlist.json');

  nock(baseUrl)
    .get('/v1/playlists/ab12')
    .reply(200, {
      name: playlist.name,
      description: playlist.description,
      numberOfTracks: playlist.numberOfTracks,
    })
    .get('/v1/playlists/ab12/tracks')
    .query({ limit: 100, offset: 0 })
    .reply(200, { items: playlist.items });

  const pif = await provider.readPlaylist('ab12');

  expect(pif).toMatchObject({
    name: 'T',
    description: 'tidal mix',
    source_service: 'tidal',
    source_playlist_id: 'ab12',
  });
  expect(pif.tracks).toHaveLength(2);
  expect(pif.tracks[0]).toMatchObject({
    position: 1,
    title: 'A',
    artists: ['AA'],
    album: 'AL',
    duration_ms: 123000,
    isrc: 'USX1',
    provider_ids: { tidal_track_id: 't1' },
  });
  expect(pif.tracks[1]).toMatchObject({
    position: 2,
    title: 'B',
    artists: ['BB'],
    album: 'BL',
    duration_ms: 1000,
    isrc: 'USX2',
    provider_ids: { tidal_track_id: 't2' },
  });
});

test('exporter creates playlist and adds tracks in batches with backoff on 429', async () => {
  vi.useFakeTimers();

  const provider = new Tidal({ token: 'test-token' });

  nock(baseUrl)
    .post('/v1/playlists', (body) => body?.name === 'TX')
    .reply(200, { uuid: 'U123' })
    .post('/v1/playlists/U123/items', (body) => Array.isArray(body?.items) && body.items.length === 2)
    .reply(429, { status: 429 }, { 'Retry-After': '1' })
    .post('/v1/playlists/U123/items', (body) => Array.isArray(body?.items) && body.items.length === 2)
    .reply(200, { succeeded: 2 })
    .post('/v1/playlists/U123/items', (body) => Array.isArray(body?.items) && body.items.length === 1)
    .reply(200, { succeeded: 1 });

  const pif = {
    name: 'TX',
    tracks: [
      { position: 1, title: 'Track 1', artists: ['Artist'], provider_ids: { tidal_track_id: 'a' } },
      { position: 2, title: 'Track 2', artists: ['Artist'], provider_ids: { tidal_track_id: 'b' } },
      { position: 3, title: 'Track 3', artists: ['Artist'], provider_ids: { tidal_track_id: 'c' } },
    ],
  };

  const pending = provider.writePlaylist(pif, { batch: { batchSize: 2 } });

  await vi.advanceTimersByTimeAsync(1000);
  const result = await pending;

  expect(result.destId).toBe('U123');
  expect(result.report).toMatchObject({
    attempted: 3,
    added: 3,
    failed: 0,
  });
});
