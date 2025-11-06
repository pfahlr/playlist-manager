import { RateLimitError } from '@app/contracts';

export interface DeezerClientOptions {
  token: string;
  baseUrl?: string;
  retries?: number;
}

export interface DeezerPlaylistMetadata {
  id?: string | number;
  title?: string | null;
  description?: string | null;
  nb_tracks?: number | null;
}

export interface DeezerArtist {
  id?: string | number;
  name?: string | null;
}

export interface DeezerAlbum {
  id?: string | number;
  title?: string | null;
  release_date?: string | null;
}

export interface DeezerTrack {
  id?: string | number;
  title?: string | null;
  title_short?: string | null;
  duration?: number | null;
  explicit_lyrics?: boolean | null;
  isrc?: string | null;
  artist?: DeezerArtist | null;
  contributors?: DeezerArtist[] | null;
  album?: DeezerAlbum | null;
}

export interface DeezerTrackPage {
  data: DeezerTrack[];
  total?: number | null;
  next?: string | null;
}

const defaultBaseUrl = 'https://api.deezer.com';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, numeric) * 1000;
  }
  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }
  return undefined;
};

const normalizeRetries = (retries: number | undefined): number => {
  if (retries === undefined || retries === null) return 3;
  if (Number.isNaN(retries) || retries < 0) return 3;
  return Math.trunc(retries);
};

export class DeezerClient {
  private readonly baseUrl: string;
  private readonly retries: number;

  constructor(private readonly options: DeezerClientOptions) {
    if (!options?.token) {
      throw new Error('Deezer token is required');
    }
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, '');
    this.retries = normalizeRetries(options.retries);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path, `${this.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
    },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);

    let attempt = 0;
    while (true) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.options.token}`,
      };
      const init: RequestInit = { method, headers };
      if (options?.body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, init);

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        if (attempt >= this.retries) {
          throw new RateLimitError('Deezer rate limit exceeded', retryAfter);
        }
        attempt += 1;
        await sleep(retryAfter ?? Math.min(2000 * attempt, 8000));
        continue;
      }

      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(`Deezer API ${response.status}: ${message}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        return undefined as T;
      }
    }
  }

  getPlaylistMetadata(id: string): Promise<DeezerPlaylistMetadata> {
    const encoded = encodeURIComponent(id);
    return this.request('GET', `/playlist/${encoded}`);
  }

  getPlaylistTracks(
    id: string,
    opts: { index: number; limit: number },
  ): Promise<DeezerTrackPage> {
    const encoded = encodeURIComponent(id);
    return this.request('GET', `/playlist/${encoded}/tracks`, {
      query: {
        limit: opts.limit,
        index: opts.index,
      },
    });
  }

  createPlaylist(payload: { title: string; description?: string | null }): Promise<{ id: string }> {
    return this.request('POST', '/user/me/playlists', { body: payload });
  }

  addTracks(playlistId: string, trackIds: string[]): Promise<void> {
    const encoded = encodeURIComponent(playlistId);
    return this.request('POST', `/playlist/${encoded}/tracks`, {
      body: { songs: trackIds },
    });
  }
}
