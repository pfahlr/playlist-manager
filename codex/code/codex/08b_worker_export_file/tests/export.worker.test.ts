import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

const prismaClientModule = vi.hoisted(() => createPrismaClientModule());
vi.mock('@prisma/client', () => prismaClientModule, { virtual: true });

const dbModule = vi.hoisted(() => ({ prisma: createPrismaStub() }));
vi.mock('@app/db', () => dbModule);

import { prisma } from '@app/db';
import { processExportFile } from '../../../../../apps/worker/src/processors/exportFile';
import * as objectStore from '../../../../../apps/worker/src/storage/objectStore';

const GOLDENS_DIR = new URL('./goldens/', import.meta.url);

const loadGolden = (name: string): string => readFileSync(new URL(name, GOLDENS_DIR), 'utf8');

async function resetDatabase() {
  await prisma.$executeRawUnsafe('RESET');
}

describe('processExportFile', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('renders CSV lean export and writes gzip artifact to object storage', async () => {
    const { job, playlist } = await createPlaylistFixture();
    const golden = loadGolden('playlist.csv');

    let capturedBody: Buffer | null = null;
    let capturedMime: string | null = null;
    let capturedKey: string | null = null;
    const writeSpy = vi.spyOn(objectStore, 'write').mockImplementation(async (body, mime, key) => {
      capturedBody = body;
      capturedMime = mime;
      capturedKey = key;
      return `s3://bucket/${key}`;
    });

    const result = await processExportFile({
      jobId: job.id,
      payload: { playlist_id: playlist.id, format: 'csv', variant: 'lean' },
    });

    expect(result.artifactUrl).toMatch(/^s3:\/\/bucket\//);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(capturedMime).toBe('application/gzip');
    expect(capturedKey).toMatch(/playlist/);

    const decompressed = gunzipSync(capturedBody!).toString('utf8');
    expect(decompressed).toEqual(golden);

    const updatedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updatedJob.status).toBe('succeeded');
    expect(updatedJob.artifact_url).toEqual(result.artifactUrl);
  });
});

async function createPlaylistFixture() {
  const user = await prisma.user.create({
    data: {
      email: `worker-export+${Math.random().toString(16).slice(2)}@local`,
    },
  });

  const playlist = await prisma.playlist.create({
    data: {
      user_id: user.id,
      name: 'Codex Export Playlist',
      description: 'Fixture for worker export job',
      provider: 'spotify',
      provider_playlist_id: 'demo-playlist',
    },
  });

  const job = await prisma.job.create({
    data: {
      user_id: user.id,
      kind: 'export_file',
      status: 'running',
      playlist_id: playlist.id,
    },
  });

  const album = await prisma.album.create({
    data: {
      title: 'Out of Time',
    },
  });

  const recording = await prisma.recording.create({
    data: {
      title: 'Losing My Religion',
      album_id: album.id,
      duration_ms: 269000,
      isrc: 'USWB19902945',
    },
  });

  const artistRem = await prisma.artist.create({ data: { name: 'R.E.M.' } });
  const artistKate = await prisma.artist.create({ data: { name: 'feat. Kate' } });

  await prisma.recordingArtist.createMany({
    data: [
      { recording_id: recording.id, artist_id: artistRem.id, ordinal: 0 },
      { recording_id: recording.id, artist_id: artistKate.id, ordinal: 1 },
    ],
  });

  await prisma.providerTrackMap.createMany({
    data: [
      { provider: 'spotify', provider_track_id: '3urbQpVxWn', recording_id: recording.id },
      { provider: 'youtube', provider_track_id: 'QzYpqAbC12', recording_id: recording.id },
    ],
  });

  await prisma.playlistItem.create({
    data: {
      playlist_id: playlist.id,
      position: 0,
      recording_id: recording.id,
      duration_ms: recording.duration_ms,
      isrc: 'USWB19902945',
    },
  });

  await prisma.playlistItem.create({
    data: {
      playlist_id: playlist.id,
      snapshot_title: 'Hurt',
      snapshot_artists: 'Nine Inch Nails',
      snapshot_album: 'The Downward Spiral',
      provider_track_id: 'track-unmatched',
    },
  });

  return { user, playlist, job };
}

function createPrismaClientModule() {
  class PrismaClient {}
  const Prisma = {
    sql(strings: TemplateStringsArray, ...values: unknown[]) {
      return { strings, values };
    },
    empty: Symbol('prisma-empty'),
  };
  return { PrismaClient, Prisma };
}

type IdKey = 'user' | 'playlist' | 'job' | 'album' | 'recording' | 'artist' | 'playlistItem' | 'providerTrackMap';

type PlaylistItemRecord = {
  id: number;
  playlist_id: number;
  position: number | null;
  recording_id: number | null;
  duration_ms: number | null;
  isrc: string | null;
  mb_recording_id?: string | null;
  mb_release_id?: string | null;
  snapshot_title?: string | null;
  snapshot_artists?: string | null;
  snapshot_album?: string | null;
  provider_track_id?: string | null;
};

type RecordingArtistRecord = {
  recording_id: number;
  artist_id: number;
  ordinal: number | null;
};

type ProviderTrackRecord = {
  id: number;
  provider: string;
  provider_track_id: string;
  recording_id: number;
};

type PrismaState = {
  users: Array<{ id: number; email: string }>;
  playlists: Array<{
    id: number;
    user_id: number;
    name: string | null;
    description: string | null;
    provider: string | null;
    provider_playlist_id: string | null;
  }>;
  jobs: Array<{
    id: number;
    user_id: number;
    kind: string;
    status: string;
    playlist_id: number | null;
    artifact_url: string | null;
    report_json: unknown;
  }>;
  albums: Array<{ id: number; title: string }>;
  recordings: Array<{
    id: number;
    title: string | null;
    duration_ms: number | null;
    album_id: number | null;
    isrc: string | null;
  }>;
  artists: Array<{ id: number; name: string }>;
  recordingArtists: RecordingArtistRecord[];
  providerTrackMaps: ProviderTrackRecord[];
  playlistItems: PlaylistItemRecord[];
};

function createPrismaStub() {
  const seq: Record<IdKey, number> = {
    user: 1,
    playlist: 1,
    job: 1,
    album: 1,
    recording: 1,
    artist: 1,
    playlistItem: 1,
    providerTrackMap: 1,
  };

  const state: PrismaState = {
    users: [],
    playlists: [],
    jobs: [],
    albums: [],
    recordings: [],
    artists: [],
    recordingArtists: [],
    providerTrackMaps: [],
    playlistItems: [],
  };

  const nextId = (key: IdKey): number => seq[key]++;

  const reset = () => {
    for (const key of Object.keys(seq) as IdKey[]) {
      seq[key] = 1;
    }
    state.users.length = 0;
    state.playlists.length = 0;
    state.jobs.length = 0;
    state.albums.length = 0;
    state.recordings.length = 0;
    state.artists.length = 0;
    state.recordingArtists.length = 0;
    state.providerTrackMaps.length = 0;
    state.playlistItems.length = 0;
  };

  return {
    async $executeRawUnsafe(): Promise<number> {
      reset();
      return 0;
    },
    async $disconnect(): Promise<void> {
      return;
    },
    user: {
      create: async ({ data }: { data: { email: string } }) => {
        const record = { id: nextId('user'), email: data.email };
        state.users.push(record);
        return record;
      },
    },
    playlist: {
      create: async ({ data }: { data: any }) => {
        const record = {
          id: nextId('playlist'),
          user_id: data.user_id,
          name: data.name ?? null,
          description: data.description ?? null,
          provider: data.provider ?? null,
          provider_playlist_id: data.provider_playlist_id ?? null,
        };
        state.playlists.push(record);
        return record;
      },
      findUnique: async ({ where }: { where: { id: number } }) =>
        state.playlists.find((p) => p.id === where.id) ?? null,
    },
    job: {
      create: async ({ data }: { data: any }) => {
        const record = {
          id: nextId('job'),
          user_id: data.user_id,
          kind: data.kind,
          status: data.status ?? 'queued',
          playlist_id: data.playlist_id ?? null,
          artifact_url: data.artifact_url ?? null,
          report_json: data.report_json ?? null,
        };
        state.jobs.push(record);
        return record;
      },
      findUnique: async ({ where }: { where: { id: number } }) =>
        state.jobs.find((job) => job.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => {
        const job = state.jobs.find((j) => j.id === where.id);
        if (!job) {
          throw new Error('Job not found');
        }
        return job;
      },
      update: async ({ where, data }: { where: { id: number }; data: any }) => {
        const job = state.jobs.find((j) => j.id === where.id);
        if (!job) {
          throw new Error('Job not found');
        }
        Object.assign(job, data);
        return job;
      },
    },
    album: {
      create: async ({ data }: { data: { title: string } }) => {
        const record = { id: nextId('album'), title: data.title };
        state.albums.push(record);
        return record;
      },
    },
    recording: {
      create: async ({ data }: { data: any }) => {
        const record = {
          id: nextId('recording'),
          title: data.title ?? null,
          duration_ms: data.duration_ms ?? null,
          album_id: data.album_id ?? null,
          isrc: data.isrc ?? null,
        };
        state.recordings.push(record);
        return record;
      },
    },
    artist: {
      create: async ({ data }: { data: { name: string } }) => {
        const record = { id: nextId('artist'), name: data.name };
        state.artists.push(record);
        return record;
      },
    },
    recordingArtist: {
      createMany: async ({ data }: { data: RecordingArtistRecord[] }) => {
        const entries = Array.isArray(data) ? data : [data];
        for (const entry of entries) {
          state.recordingArtists.push({
            recording_id: entry.recording_id,
            artist_id: entry.artist_id,
            ordinal: entry.ordinal ?? null,
          });
        }
        return { count: entries.length };
      },
    },
    providerTrackMap: {
      createMany: async ({ data }: { data: Omit<ProviderTrackRecord, 'id'>[] }) => {
        const entries = Array.isArray(data) ? data : [data];
        for (const entry of entries) {
          state.providerTrackMaps.push({
            id: nextId('providerTrackMap'),
            provider: entry.provider,
            provider_track_id: entry.provider_track_id,
            recording_id: entry.recording_id,
          });
        }
        return { count: entries.length };
      },
      findMany: async ({ where, select }: { where: any; select?: Record<string, boolean> }) => {
        const ids: number[] = where?.recording_id?.in ?? [];
        return state.providerTrackMaps
          .filter((row) => ids.includes(row.recording_id))
          .map((row) => {
            if (!select) return row;
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(select)) {
              if (select[key as keyof ProviderTrackRecord]) {
                result[key] = (row as any)[key];
              }
            }
            return result;
          });
      },
    },
    playlistItem: {
      create: async ({ data }: { data: any }) => {
        const record: PlaylistItemRecord = {
          id: nextId('playlistItem'),
          playlist_id: data.playlist_id,
          position: data.position ?? null,
          recording_id: data.recording_id ?? null,
          duration_ms: data.duration_ms ?? null,
          isrc: data.isrc ?? null,
          mb_recording_id: data.mb_recording_id ?? null,
          mb_release_id: data.mb_release_id ?? null,
          snapshot_title: data.snapshot_title ?? null,
          snapshot_artists: data.snapshot_artists ?? null,
          snapshot_album: data.snapshot_album ?? null,
          provider_track_id: data.provider_track_id ?? null,
        };
        state.playlistItems.push(record);
        return record;
      },
    },
    async $queryRaw(query: { strings?: TemplateStringsArray; values?: unknown[] }) {
      if (query?.strings?.join(' ').includes('v_playlist_item_effective')) {
        const playlistId = (query.values?.[0] ?? null) as number | null;
        if (typeof playlistId !== 'number') {
          return [];
        }
        return buildEffectiveRows(state, playlistId);
      }
      return [];
    },
  };
}

function buildEffectiveRows(state: PrismaState, playlistId: number) {
  const items = state.playlistItems.filter((item) => item.playlist_id === playlistId);
  return items
    .map((item) => {
      const recording =
        typeof item.recording_id === 'number'
          ? state.recordings.find((r) => r.id === item.recording_id) ?? null
          : null;
      const album = recording?.album_id ? state.albums.find((a) => a.id === recording.album_id) ?? null : null;
      const artists = normalizeArtists(state, item.recording_id);
      return {
        id: item.id,
        playlist_id: item.playlist_id,
        position: item.position,
        title: recording?.title ?? item.snapshot_title ?? '',
        artists: artists ?? (item.snapshot_artists ?? ''),
        album: album?.title ?? item.snapshot_album ?? null,
        duration_ms: recording?.duration_ms ?? item.duration_ms ?? null,
        recording_id: item.recording_id,
        isrc: item.isrc ?? null,
        mb_recording_id: item.mb_recording_id ?? null,
        mb_release_id: item.mb_release_id ?? null,
        provider_track_id: item.provider_track_id ?? null,
      };
    })
    .sort((a, b) => {
      const posA = a.position ?? Number.MAX_SAFE_INTEGER;
      const posB = b.position ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) {
        return posA - posB;
      }
      return a.id - b.id;
    });
}

function normalizeArtists(state: PrismaState, recordingId: number | null) {
  if (typeof recordingId !== 'number') {
    return null;
  }
  const entries: RecordingArtistRecord[] = state.recordingArtists
    .filter((ra: RecordingArtistRecord) => ra.recording_id === recordingId)
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  if (entries.length === 0) {
    return null;
  }
  const names = entries
    .map((entry) => state.artists.find((artist) => artist.id === entry.artist_id)?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  return names.length > 0 ? names.join('; ') : null;
}
