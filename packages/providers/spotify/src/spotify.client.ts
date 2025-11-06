import { RateLimitError } from '@app/contracts';

export interface SpotifyClientOptions {
  token: string;
  baseUrl?: string;
}

export interface SpotifyUserProfile {
  id: string;
}

export interface SpotifyArtist {
  name: string;
}

export interface SpotifyAlbum {
  name?: string | null;
  release_date?: string | null;
}

export interface SpotifyTrack {
  id?: string | null;
  name: string;
  duration_ms?: number | null;
  explicit?: boolean | null;
  external_ids?: { isrc?: string | null } | null;
  artists?: SpotifyArtist[] | null;
  album?: SpotifyAlbum | null;
  is_local?: boolean | null;
}

export interface SpotifyPlaylistItem {
  track: SpotifyTrack | null;
}

export interface SpotifyPlaylistPage {
  items: SpotifyPlaylistItem[];
  next: string | null;
  offset: number;
  limit: number;
  total: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string | null;
  tracks: SpotifyPlaylistPage;
}

const defaultBaseUrl = 'https://api.spotify.com/v1';

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

export class SpotifyClient {
  private readonly baseUrl: string;

  constructor(private readonly options: SpotifyClientOptions) {
    if (!options.token) {
      throw new Error('Spotify token is required');
    }
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, '');
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, path: string, options?: {
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  }): Promise<T> {
    const url = this.buildUrl(path, options?.query);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.token}`,
    };

    const init: RequestInit = {
      method,
      headers,
    };

    if (options?.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      throw new RateLimitError('Spotify rate limit exceeded', retryAfter);
    }

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`Spotify API ${response.status}: ${message}`);
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

  getPlaylist(id: string): Promise<SpotifyPlaylist> {
    const encoded = encodeURIComponent(id);
    return this.request<SpotifyPlaylist>('GET', `/playlists/${encoded}`);
  }

  getPlaylistTracks(id: string, opts: { offset: number; limit: number }): Promise<SpotifyPlaylistPage> {
    const encoded = encodeURIComponent(id);
    return this.request<SpotifyPlaylistPage>('GET', `/playlists/${encoded}/tracks`, {
      query: {
        offset: opts.offset,
        limit: opts.limit,
      },
    });
  }

  getCurrentUser(): Promise<SpotifyUserProfile> {
    return this.request<SpotifyUserProfile>('GET', '/me');
  }

  createPlaylist(userId: string, payload: { name: string; description?: string | null }): Promise<{ id: string }> {
    const encoded = encodeURIComponent(userId);
    return this.request<{ id: string }>('POST', `/users/${encoded}/playlists`, { body: payload });
  }

  addTracks(playlistId: string, uris: string[]): Promise<void> {
    const encoded = encodeURIComponent(playlistId);
    return this.request<void>('POST', `/playlists/${encoded}/tracks`, {
      body: { uris },
    });
  }
}
