import type {
  BackoffOptions,
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
import { RateLimitError } from '@app/contracts';

import {
  TidalClient,
  type TidalTrackItem,
} from './tidal.client.ts';

type Milliseconds = number;

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  retries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

const sleep = (ms: Milliseconds) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePageSize = (pageSize: number | undefined): number => {
  if (!pageSize || Number.isNaN(pageSize) || pageSize <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.trunc(pageSize), 100);
};

const normalizeBatchSize = (batchSize: number | undefined): number => {
  if (!batchSize || Number.isNaN(batchSize) || batchSize <= 0) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(1, Math.trunc(batchSize));
};

const normalizeBackoff = (backoff?: BackoffOptions): Required<BackoffOptions> => ({
  retries: backoff?.retries ?? DEFAULT_BACKOFF.retries,
  baseDelayMs: backoff?.baseDelayMs ?? DEFAULT_BACKOFF.baseDelayMs,
  maxDelayMs: backoff?.maxDelayMs ?? DEFAULT_BACKOFF.maxDelayMs,
});

const toMilliseconds = (value: number | string | null | undefined): number | null => {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 1000) {
    return Math.round(numeric);
  }
  return Math.round(numeric * 1000);
};

const extractArtists = (item: TidalTrackItem): string[] => {
  const track = item?.track;
  if (!track?.artists) return [];
  return track.artists
    .map((artist) => artist?.name?.trim())
    .filter((name): name is string => Boolean(name));
};

const mapTrack = (item: TidalTrackItem, index: number): PIFTrack | undefined => {
  const track = item?.track;
  if (!track?.title) {
    return undefined;
  }

  const artists = extractArtists(item);
  const artistList = artists.length > 0 ? artists : ['Unknown Artist'];

  const mapped: PIFTrack = {
    position: index + 1,
    title: track.title,
    artists: artistList,
    album: track.album?.title ?? null,
    duration_ms: toMilliseconds(track.duration),
    explicit: null,
    release_date: null,
    isrc: track.isrc ?? track.externalIds?.isrc ?? null,
  };

  if (track.id) {
    mapped.provider_ids = { tidal_track_id: track.id };
  }

  return mapped;
};

interface TidalOptions {
  token?: string;
  auth?: ProviderAuth;
  baseUrl?: string;
}

export default class Tidal implements ProviderImpl, Importer, Exporter {
  public readonly name: ProviderName = 'tidal';

  private readonly options: TidalOptions;
  private client?: TidalClient;

  constructor(options?: TidalOptions) {
    this.options = options ?? {};
  }

  private ensureClient(): TidalClient {
    if (this.client) return this.client;
    const token = this.options.token ?? this.options.auth?.token;
    if (!token) {
      throw new Error('Tidal auth token is required');
    }
    this.client = new TidalClient({
      token,
      baseUrl: this.options.baseUrl,
    });
    return this.client;
  }

  private async fetchAllTracks(id: string, pageSize: number): Promise<TidalTrackItem[]> {
    const client = this.ensureClient();
    const items: TidalTrackItem[] = [];
    let offset = 0;
    let iteration = 0;
    const maxIterations = 1000;

    while (iteration < maxIterations) {
      iteration += 1;
      const page = await client.getPlaylistTracks(id, { limit: pageSize, offset });
      const pageItems = Array.isArray(page.items) ? page.items : [];
      if (pageItems.length === 0) {
        break;
      }

      items.push(...pageItems);

      if (pageItems.length < pageSize) {
        break;
      }

      offset += pageItems.length;
    }

    return items;
  }

  async readPlaylist(id: string, opts?: ReadOptions): Promise<PIF> {
    const client = this.ensureClient();
    const pageSize = normalizePageSize(opts?.pageSize);

    const playlist = await client.getPlaylist(id);
    const items = await this.fetchAllTracks(id, pageSize);

    const tracks = items
      .map(mapTrack)
      .filter((track): track is NonNullable<ReturnType<typeof mapTrack>> => Boolean(track));

    return {
      name: playlist.name ?? 'Untitled Playlist',
      description: playlist.description ?? null,
      source_service: 'tidal',
      source_playlist_id: id,
      tracks,
    };
  }

  private async runWithBackoff<T>(fn: () => Promise<T>, backoff?: BackoffOptions): Promise<T> {
    const { retries, baseDelayMs, maxDelayMs } = normalizeBackoff(backoff);
    let attempt = 0;

    while (true) {
      try {
        return await fn();
      } catch (error) {
        if (!(error instanceof RateLimitError)) {
          throw error;
        }

        if (attempt >= retries) {
          throw error;
        }

        const delay = Math.min(
          error.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt),
          maxDelayMs,
        );
        attempt += 1;
        await sleep(delay);
      }
    }
  }

  async writePlaylist(pif: PIF, opts?: WriteOptions): Promise<WritePlaylistResult> {
    const client = this.ensureClient();
    const batchSize = normalizeBatchSize(opts?.batch?.batchSize);

    const created = await client.createPlaylist({
      name: pif.name,
      description: pif.description ?? null,
    });

    const playlistId = created.uuid;
    if (!playlistId) {
      throw new Error('Tidal playlist UUID missing from create response');
    }

    const trackIds: string[] = [];
    let skipped = 0;

    for (const track of pif.tracks) {
      const tidalId = track.provider_ids?.tidal_track_id;
      if (!tidalId) {
        skipped += 1;
        continue;
      }
      trackIds.push(tidalId);
    }

    let added = 0;

    for (let cursor = 0; cursor < trackIds.length; cursor += batchSize) {
      const batch = trackIds.slice(cursor, cursor + batchSize);
      const result = await this.runWithBackoff(
        () => client.addPlaylistItems(playlistId, batch),
        opts?.backoff,
      );
      const succeeded = Math.min(result?.succeeded ?? batch.length, batch.length);
      added += succeeded;
    }

    const report: WritePlaylistResult['report'] = {
      attempted: trackIds.length,
      added,
      failed: Math.max(0, trackIds.length - added),
    };

    if (skipped > 0) {
      report.skipped = skipped;
      report.notes = [`${skipped} track(s) missing tidal_track_id`];
    }

    return {
      destId: playlistId,
      report,
    };
  }
}
