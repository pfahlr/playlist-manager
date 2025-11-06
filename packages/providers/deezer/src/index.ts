import type {
  Exporter,
  Importer,
  PIF,
  PIFTrack,
  ProviderAuth,
  ProviderImpl,
  ProviderName,
  ReadOptions,
  WriteOptions,
  WritePlaylistResult,
} from '@app/contracts';

import {
  DeezerClient,
  type DeezerTrack,
} from './deezer.client.ts';

type Milliseconds = number;

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;

const parsePositiveInt = (value: string | number | undefined | null): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.trunc(numeric);
};

const normalizePageSize = (pageSize: number | undefined): number => {
  const parsed = parsePositiveInt(pageSize);
  if (!parsed) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, 100);
};

const dedupe = (items: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const trimmed = item?.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
};

const extractArtists = (track: DeezerTrack): string[] => {
  const candidates: string[] = [];
  if (track.artist?.name) {
    candidates.push(track.artist.name);
  }
  if (Array.isArray(track.contributors)) {
    for (const contributor of track.contributors) {
      if (contributor?.name) {
        candidates.push(contributor.name);
      }
    }
  }
  return dedupe(candidates);
};

const toMilliseconds = (value: number | string | null | undefined): number | null => {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric * 1000));
};

const parseNextIndex = (next: string | null | undefined, fallback: number): number => {
  if (!next) return fallback;
  try {
    const url = new URL(next);
    const raw = url.searchParams.get('index');
    if (raw !== null) {
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric >= 0) {
        return Math.trunc(numeric);
      }
    }
  } catch {
    // ignore parsing issues and fallback
  }
  return fallback;
};

const resolveBatchSize = (optsBatchSize?: number): number => {
  const envBatch = parsePositiveInt(process.env.PROVIDERS_DEEZER_BATCH_SIZE);
  const provided = parsePositiveInt(optsBatchSize);
  return provided ?? envBatch ?? DEFAULT_BATCH_SIZE;
};

const resolveRetries = (optsRetries?: number): number => {
  const envRetries = parsePositiveInt(process.env.PROVIDERS_DEEZER_MAX_RETRIES);
  const provided = parsePositiveInt(optsRetries);
  return provided ?? envRetries ?? DEFAULT_MAX_RETRIES;
};

const sleep = (ms: Milliseconds) => new Promise((resolve) => setTimeout(resolve, ms));

interface DeezerOptions {
  token?: string;
  auth?: ProviderAuth;
  baseUrl?: string;
  batchSize?: number;
  maxRetries?: number;
}

export default class Deezer implements ProviderImpl, Importer, Exporter {
  public readonly name: ProviderName = 'deezer';

  private readonly options: DeezerOptions;
  private readonly defaultBatchSize: number;
  private readonly maxRetries: number;
  private client?: DeezerClient;

  constructor(options?: DeezerOptions) {
    this.options = options ?? {};
    this.defaultBatchSize = resolveBatchSize(this.options.batchSize);
    this.maxRetries = resolveRetries(this.options.maxRetries);
  }

  private ensureClient(): DeezerClient {
    if (this.client) return this.client;
    const token = this.options.token ?? this.options.auth?.token;
    if (!token) {
      throw new Error('Deezer auth token is required');
    }
    this.client = new DeezerClient({
      token,
      baseUrl: this.options.baseUrl,
      retries: this.maxRetries,
    });
    return this.client;
  }

  private async fetchAllTracks(id: string, pageSize: number): Promise<DeezerTrack[]> {
    const client = this.ensureClient();
    const tracks: DeezerTrack[] = [];
    let index = 0;
    let iterations = 0;
    let total: number | undefined;

    while (true) {
      iterations += 1;
      if (iterations > 1000) break;

      const page = await client.getPlaylistTracks(id, { index, limit: pageSize });
      const data = Array.isArray(page.data) ? page.data : [];
      if (data.length === 0) {
        break;
      }

      tracks.push(...data);

      if (page.total !== undefined && page.total !== null) {
        const numericTotal = Number(page.total);
        if (Number.isFinite(numericTotal) && numericTotal >= 0) {
          total = Math.trunc(numericTotal);
        }
      }

      const nextIndex = parseNextIndex(page.next, index + data.length);
      if (!page.next || nextIndex <= index) {
        break;
      }
      index = nextIndex;

      if (total !== undefined && index >= total) {
        break;
      }
    }

    return tracks;
  }

  private mapTrack(track: DeezerTrack, position: number): PIFTrack | undefined {
    const title = track.title ?? track.title_short ?? null;
    if (!title) return undefined;

    const artists = extractArtists(track);
    const artistList = artists.length > 0 ? artists : ['Unknown Artist'];

    const providerId =
      track.id === undefined || track.id === null ? undefined : String(track.id);

    const explicit =
      track.explicit_lyrics === null || track.explicit_lyrics === undefined
        ? null
        : Boolean(track.explicit_lyrics);

    const mapped: PIFTrack = {
      position: position + 1,
      title,
      artists: artistList,
      album: track.album?.title ?? null,
      duration_ms: toMilliseconds(track.duration),
      explicit,
      release_date: track.album?.release_date ?? null,
      isrc: track.isrc ?? null,
    };

    if (providerId) {
      mapped.provider_ids = { deezer_track_id: providerId };
    }

    return mapped;
  }

  async readPlaylist(id: string, opts?: ReadOptions): Promise<PIF> {
    const client = this.ensureClient();
    const pageSize = normalizePageSize(opts?.pageSize);
    const metadata = await client.getPlaylistMetadata(id);
    const rawTracks = await this.fetchAllTracks(id, pageSize);

    const tracks: PIFTrack[] = [];
    for (const track of rawTracks) {
      const mapped = this.mapTrack(track, tracks.length);
      if (mapped) {
        tracks.push(mapped);
      }
    }

    return {
      name: metadata.title ?? `Deezer playlist ${id}`,
      description: metadata.description ?? null,
      source_service: 'deezer',
      source_playlist_id: metadata.id ? String(metadata.id) : id,
      tracks,
    };
  }

  private async addTracksWithRetry(playlistId: string, chunk: string[]): Promise<void> {
    const client = this.ensureClient();
    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        await client.addTracks(playlistId, chunk);
        return;
      } catch (error) {
        attempt += 1;
        if (attempt > this.maxRetries || !(error instanceof Error)) {
          throw error;
        }
        if ('retryAfterMs' in error && typeof (error as any).retryAfterMs === 'number') {
          await sleep((error as any).retryAfterMs);
          continue;
        }
        await sleep(Math.min(1000 * attempt, 4000));
      }
    }
  }

  async writePlaylist(pif: PIF, opts?: WriteOptions): Promise<WritePlaylistResult> {
    const client = this.ensureClient();
    const batchSize = parsePositiveInt(opts?.batch?.batchSize) ?? this.defaultBatchSize;

    const created = await client.createPlaylist({
      title: pif.name,
      description: pif.description ?? undefined,
    });

    const destId = created?.id ? String(created.id) : undefined;
    if (!destId) {
      throw new Error('Deezer playlist creation failed');
    }

    const trackIds: string[] = [];
    let skipped = 0;
    for (const track of pif.tracks) {
      const deezerId = track.provider_ids?.deezer_track_id;
      if (!deezerId) {
        skipped += 1;
        continue;
      }
      trackIds.push(deezerId);
    }

    let added = 0;
    for (let offset = 0; offset < trackIds.length; offset += batchSize) {
      const chunk = trackIds.slice(offset, offset + batchSize);
      await this.addTracksWithRetry(destId, chunk);
      added += chunk.length;
    }

    const report: WritePlaylistResult['report'] = {
      attempted: trackIds.length,
      added,
      failed: trackIds.length - added,
    };

    if (skipped > 0) {
      report.skipped = skipped;
      report.notes = [`${skipped} track(s) missing deezer_track_id`];
    }

    return {
      destId,
      report,
    };
  }
}
