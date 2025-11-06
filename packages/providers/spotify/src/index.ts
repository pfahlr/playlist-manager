import type {
  BackoffOptions,
  Exporter,
  Importer,
  PIF,
  ProviderAuth,
  ProviderImpl,
  ProviderName,
  ReadOptions,
  WriteOptions,
  WritePlaylistResult,
} from '@app/contracts';
import { RateLimitError } from '@app/contracts';

import {
  SpotifyClient,
  type SpotifyPlaylist,
  type SpotifyPlaylistItem,
} from './spotify.client.ts';

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
  return Math.trunc(batchSize);
};

const normalizeBackoff = (backoff?: BackoffOptions): Required<BackoffOptions> => ({
  retries: backoff?.retries ?? DEFAULT_BACKOFF.retries,
  baseDelayMs: backoff?.baseDelayMs ?? DEFAULT_BACKOFF.baseDelayMs,
  maxDelayMs: backoff?.maxDelayMs ?? DEFAULT_BACKOFF.maxDelayMs,
});

interface SpotifyOptions {
  auth?: ProviderAuth;
  baseUrl?: string;
}

const toUri = (trackId: string): string => `spotify:track:${trackId}`;

const mapTrack = (item: SpotifyPlaylistItem, index: number) => {
  const track = item.track;
  if (!track || track.is_local) {
    return undefined;
  }

  const artists = (track.artists ?? [])
    .map((artist) => artist?.name)
    .filter((name): name is string => Boolean(name));

  return {
    position: index + 1,
    title: track.name,
    artists,
    album: track.album?.name ?? null,
    duration_ms: track.duration_ms ?? null,
    explicit: track.explicit ?? null,
    release_date: track.album?.release_date ?? null,
    isrc: track.external_ids?.isrc ?? null,
    provider_ids: track.id ? { spotify_track_id: track.id } : undefined,
  };
};

export default class Spotify implements ProviderImpl, Importer, Exporter {
  public readonly name: ProviderName = 'spotify';

  private readonly options: SpotifyOptions;
  private client?: SpotifyClient;

  constructor(options?: SpotifyOptions) {
    this.options = options ?? {};
  }

  private ensureClient(): SpotifyClient {
    if (this.client) return this.client;
    const token = this.options.auth?.token;
    if (!token) {
      throw new Error('Spotify auth token is required');
    }
    this.client = new SpotifyClient({
      token,
      baseUrl: this.options.baseUrl,
    });
    return this.client;
  }

  private async fetchAllTracks(playlist: SpotifyPlaylist, pageSize: number): Promise<SpotifyPlaylistItem[]> {
    const items = [...playlist.tracks.items];

    let next = playlist.tracks.next;
    let offset = playlist.tracks.offset + playlist.tracks.items.length;

    const client = this.ensureClient();

    while (next) {
      const page = await client.getPlaylistTracks(playlist.id, { offset, limit: pageSize });
      items.push(...page.items);
      next = page.next;
      offset += page.items.length;
      if (page.items.length === 0) {
        break;
      }
    }

    return items;
  }

  async readPlaylist(id: string, opts?: ReadOptions): Promise<PIF> {
    const pageSize = normalizePageSize(opts?.pageSize);
    const client = this.ensureClient();
    const playlist = await client.getPlaylist(id);
    const items = await this.fetchAllTracks(playlist, pageSize);

    const tracks = items
      .map(mapTrack)
      .filter((track): track is NonNullable<ReturnType<typeof mapTrack>> => Boolean(track));

    return {
      name: playlist.name,
      description: playlist.description ?? null,
      source_service: 'spotify',
      source_playlist_id: playlist.id,
      tracks,
    };
  }

  private async runWithBackoff(fn: () => Promise<void>, backoff: BackoffOptions | undefined) {
    const { retries, baseDelayMs, maxDelayMs } = normalizeBackoff(backoff);
    let attempt = 0;

    while (true) {
      try {
        await fn();
        return;
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
    const backoff = opts?.backoff;

    const profile = await client.getCurrentUser();
    const created = await client.createPlaylist(profile.id, {
      name: pif.name,
      description: pif.description ?? null,
    });

    const uris: string[] = [];
    let skipped = 0;

    for (const track of pif.tracks) {
      const trackId = track.provider_ids?.spotify_track_id;
      if (!trackId) {
        skipped += 1;
        continue;
      }
      uris.push(toUri(trackId));
    }

    let added = 0;
    for (let cursor = 0; cursor < uris.length; cursor += batchSize) {
      const batch = uris.slice(cursor, cursor + batchSize);
      await this.runWithBackoff(() => client.addTracks(created.id, batch), backoff);
      added += batch.length;
    }

    const report: WritePlaylistResult['report'] = {
      attempted: uris.length,
      added,
      failed: uris.length - added,
    };

    if (skipped > 0) {
      report.skipped = skipped;
      report.notes = [`${skipped} track(s) missing spotify_track_id`];
    }

    return {
      destId: created.id,
      report,
    };
  }
}
