import { RateLimitError } from '@app/contracts';

export interface YouTubeClientOptions {
  token: string;
  baseUrl?: string;
}

export interface YouTubePlaylistSnippet {
  title?: string | null;
  description?: string | null;
}

export interface YouTubePlaylistItem {
  id?: string | null;
  snippet?: YouTubePlaylistSnippet | null;
}

export interface YouTubePlaylistResponse {
  items?: YouTubePlaylistItem[] | null;
}

export interface YouTubePlaylistItemsResponse {
  items?: Array<{
    contentDetails?: {
      videoId?: string | null;
    } | null;
  }> | null;
  nextPageToken?: string | null;
}

export interface YouTubeVideoSnippet {
  title?: string | null;
  channelTitle?: string | null;
}

export interface YouTubeVideoDetails {
  duration?: string | null;
}

export interface YouTubeVideo {
  id?: string | null;
  snippet?: YouTubeVideoSnippet | null;
  contentDetails?: YouTubeVideoDetails | null;
}

export interface YouTubeVideosResponse {
  items?: YouTubeVideo[] | null;
}

export interface YouTubeSearchResponse {
  items?: Array<{
    id?: {
      videoId?: string | null;
    } | null;
  }> | null;
}

const defaultBaseUrl = 'https://www.googleapis.com/youtube/v3';

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000;
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }
  return undefined;
};

type HttpMethod = 'GET' | 'POST';

export class YouTubeClient {
  private readonly baseUrl: string;

  constructor(private readonly options: YouTubeClientOptions) {
    if (!options?.token) {
      throw new Error('YouTube token is required');
    }
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, '');
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | null | undefined>,
  ): string {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(normalizedPath, `${this.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    options?: {
      query?: Record<string, string | number | null | undefined>;
      body?: unknown;
    },
  ): Promise<T> {
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
      throw new RateLimitError('YouTube rate limit exceeded', retryAfter);
    }

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`YouTube API ${response.status}: ${message}`);
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

  getPlaylist(id: string): Promise<YouTubePlaylistResponse> {
    return this.request('GET', '/playlists', {
      query: {
        part: 'snippet',
        id,
      },
    });
  }

  getPlaylistItems(
    playlistId: string,
    opts: { maxResults: number; pageToken?: string },
  ): Promise<YouTubePlaylistItemsResponse> {
    return this.request('GET', '/playlistItems', {
      query: {
        part: 'contentDetails',
        playlistId,
        maxResults: Math.min(Math.max(opts.maxResults, 1), 50),
        pageToken: opts.pageToken,
      },
    });
  }

  getVideos(ids: string[]): Promise<YouTubeVideosResponse> {
    return this.request('GET', '/videos', {
      query: {
        part: 'snippet,contentDetails',
        id: ids.join(','),
      },
    });
  }

  searchVideos(query: string, opts?: { maxResults?: number }): Promise<YouTubeSearchResponse> {
    const maxResults = opts?.maxResults && opts.maxResults > 0 ? Math.min(opts.maxResults, 10) : 5;
    return this.request('GET', '/search', {
      query: {
        part: 'snippet',
        type: 'video',
        maxResults,
        q: query,
      },
    });
  }

  createPlaylist(payload: { title: string; description?: string | null }): Promise<{ id: string }> {
    return this.request('POST', '/playlists', {
      query: { part: 'snippet' },
      body: {
        snippet: {
          title: payload.title,
          description: payload.description ?? null,
        },
        status: {
          privacyStatus: 'private',
        },
      },
    });
  }

  async insertPlaylistItems(playlistId: string, videoIds: string[]): Promise<void> {
    for (const videoId of videoIds) {
      await this.request('POST', '/playlistItems', {
        query: { part: 'snippet' },
        body: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      });
    }
  }
}
