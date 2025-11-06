import { RateLimitError } from '@app/contracts';

export interface TidalClientOptions {
  token: string;
  baseUrl?: string;
}

export interface TidalPlaylist {
  uuid?: string;
  name?: string | null;
  description?: string | null;
  numberOfTracks?: number | null;
}

export interface TidalArtist {
  name?: string | null;
}

export interface TidalAlbum {
  title?: string | null;
}

export interface TidalExternalIds {
  isrc?: string | null;
}

export interface TidalTrack {
  id?: string | null;
  title?: string | null;
  duration?: number | null;
  isrc?: string | null;
  artists?: TidalArtist[] | null;
  album?: TidalAlbum | null;
  externalIds?: TidalExternalIds | null;
}

export interface TidalTrackItem {
  track?: TidalTrack | null;
}

export interface TidalTrackPage {
  items?: TidalTrackItem[] | null;
}

const defaultBaseUrl = 'https://api.tidal.com';

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, numeric) * 1000;
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }
  return undefined;
};

export class TidalClient {
  private readonly baseUrl: string;

  constructor(private readonly options: TidalClientOptions) {
    if (!options?.token) {
      throw new Error('Tidal token is required');
    }
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, '');
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
    options?: { body?: unknown; query?: Record<string, string | number | undefined> },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);
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
      throw new RateLimitError('Tidal rate limit exceeded', retryAfter);
    }

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`Tidal API ${response.status}: ${message}`);
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

  getPlaylist(id: string): Promise<TidalPlaylist> {
    const encoded = encodeURIComponent(id);
    return this.request('GET', `/v1/playlists/${encoded}`);
  }

  getPlaylistTracks(id: string, opts: { limit: number; offset: number }): Promise<TidalTrackPage> {
    const encoded = encodeURIComponent(id);
    return this.request('GET', `/v1/playlists/${encoded}/tracks`, {
      query: {
        limit: opts.limit,
        offset: opts.offset,
      },
    });
  }

  createPlaylist(payload: { name: string; description?: string | null }): Promise<{ uuid: string }> {
    return this.request('POST', '/v1/playlists', { body: payload });
  }

  addPlaylistItems(
    playlistId: string,
    trackIds: string[],
  ): Promise<{ succeeded: number }> {
    const encoded = encodeURIComponent(playlistId);
    const items = trackIds.map((id) => ({ id }));
    return this.request('POST', `/v1/playlists/${encoded}/items`, { body: { items } });
  }
}
