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
  YouTubeClient,
  type YouTubeVideo,
} from './youtube.client.ts';

interface YouTubeOptions {
  token?: string;
  auth?: ProviderAuth;
  baseUrl?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_BATCH_SIZE = 50;

const normalizePageSize = (value: number | undefined): number => {
  if (!value || Number.isNaN(value) || value <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.trunc(value), 50);
};

const normalizeBatchSize = (value: number | undefined): number => {
  if (!value || Number.isNaN(value) || value <= 0) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(1, Math.trunc(value));
};

const ISO_DURATION_RE =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

const parseDurationMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = ISO_DURATION_RE.exec(value);
  if (!match) return null;

  const [, d, h, m, s] = match;

  const days = d ? Number(d) : 0;
  const hours = h ? Number(h) : 0;
  const minutes = m ? Number(m) : 0;
  const seconds = s ? Number(s) : 0;

  if ([days, hours, minutes, seconds].every((part) => !Number.isFinite(part))) {
    return null;
  }

  const totalSeconds =
    (days * 24 * 60 * 60) +
    (hours * 60 * 60) +
    (minutes * 60) +
    seconds;

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }

  return Math.round(totalSeconds * 1000);
};

const sanitizeArtist = (channelTitle: string | null | undefined): string | null => {
  if (!channelTitle) return null;
  const trimmed = channelTitle.replace(/\s*-\s*topic$/i, '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractArtists = (video: YouTubeVideo): string[] => {
  const fromChannel = sanitizeArtist(video.snippet?.channelTitle);
  if (fromChannel) {
    return [fromChannel];
  }
  return ['Unknown Artist'];
};

const chunk = <T,>(input: T[], size: number): T[][] => {
  if (input.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    batches.push(input.slice(i, i + size));
  }
  return batches;
};

const buildSearchKey = (track: PIFTrack): string | null => {
  const title = track.title?.trim().toLowerCase();
  const artists = (track.artists ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!title || artists.length === 0) {
    return null;
  }
  return `${title}|${artists.join(',')}`;
};

const buildSearchQuery = (track: PIFTrack): string | null => {
  const title = track.title?.trim();
  const artists = (track.artists ?? []).map((artist) => artist.trim()).filter(Boolean);
  if (!title || artists.length === 0) {
    return null;
  }
  return `${title} ${artists.join(' ')}`.trim();
};

export default class YouTube implements ProviderImpl, Importer, Exporter {
  public readonly name: ProviderName = 'youtube';

  private readonly options: YouTubeOptions;
  private client?: YouTubeClient;
  private readonly searchCache = new Map<string, string | null>();

  constructor(options?: YouTubeOptions) {
    this.options = options ?? {};
  }

  private ensureClient(): YouTubeClient {
    if (this.client) return this.client;
    const token = this.options.token ?? this.options.auth?.token;
    if (!token) {
      throw new Error('YouTube auth token is required');
    }
    this.client = new YouTubeClient({
      token,
      baseUrl: this.options.baseUrl,
    });
    return this.client;
  }

  private mapVideoToTrack(videoId: string, video: YouTubeVideo | undefined, index: number): PIFTrack | undefined {
    if (!video) return undefined;
    const title = video.snippet?.title?.trim();
    if (!title) {
      return undefined;
    }

    const track: PIFTrack = {
      position: index + 1,
      title,
      artists: extractArtists(video),
      album: null,
      duration_ms: parseDurationMs(video.contentDetails?.duration),
      explicit: null,
      release_date: null,
      isrc: null,
      provider_ids: { youtube_video_id: videoId },
    };

    return track;
  }

  async readPlaylist(id: string, opts?: ReadOptions): Promise<PIF> {
    const client = this.ensureClient();
    const pageSize = normalizePageSize(opts?.pageSize);

    const playlistResponse = await client.getPlaylist(id);
    const playlistItemIds: string[] = [];
    let pageToken: string | undefined;
    let iterations = 0;

    while (iterations < 1000) {
      iterations += 1;
      const page = await client.getPlaylistItems(id, { maxResults: pageSize, pageToken });
      const items = page.items ?? [];
      for (const item of items) {
        const videoId = item?.contentDetails?.videoId;
        if (videoId) {
          playlistItemIds.push(videoId);
        }
      }
      if (!page.nextPageToken) {
        break;
      }
      pageToken = page.nextPageToken ?? undefined;
      if (!pageToken) {
        break;
      }
    }

    const videoMap = new Map<string, YouTubeVideo>();
    for (const group of chunk(playlistItemIds, 50)) {
      if (group.length === 0) continue;
      const details = await client.getVideos(group);
      const videos = details.items ?? [];
      for (const video of videos) {
        const videoId = video?.id;
        if (videoId) {
          videoMap.set(videoId, video);
        }
      }
    }

    const tracks = playlistItemIds
      .map((videoId, index) => this.mapVideoToTrack(videoId, videoMap.get(videoId), index))
      .filter((track): track is PIFTrack => Boolean(track));

    const playlistItem = playlistResponse.items?.[0];
    const snippet = playlistItem?.snippet;

    return {
      name: snippet?.title ?? `Playlist ${id}`,
      description: snippet?.description ?? null,
      source_service: 'youtube',
      source_playlist_id: id,
      tracks,
    };
  }

  private async resolveVideoId(track: PIFTrack): Promise<string | null> {
    const directId = track.provider_ids?.youtube_video_id?.trim();
    if (directId) {
      return directId;
    }

    const key = buildSearchKey(track);
    if (!key) {
      return null;
    }

    if (this.searchCache.has(key)) {
      return this.searchCache.get(key) ?? null;
    }

    const query = buildSearchQuery(track);
    if (!query) {
      this.searchCache.set(key, null);
      return null;
    }

    const client = this.ensureClient();
    const response = await client.searchVideos(query, { maxResults: 5 });
    const first = response.items?.[0]?.id?.videoId?.trim() ?? null;
    this.searchCache.set(key, first);
    return first;
  }

  async writePlaylist(pif: PIF, opts?: WriteOptions): Promise<WritePlaylistResult> {
    const client = this.ensureClient();
    const batchSize = normalizeBatchSize(opts?.batch?.batchSize);

    const created = await client.createPlaylist({
      title: pif.name,
      description: pif.description ?? null,
    });

    const videoIds: string[] = [];
    let skipped = 0;

    for (const track of pif.tracks) {
      const videoId = await this.resolveVideoId(track);
      if (videoId) {
        videoIds.push(videoId);
      } else {
        skipped += 1;
      }
    }

    let added = 0;

    for (const group of chunk(videoIds, batchSize)) {
      await client.insertPlaylistItems(created.id, group);
      added += group.length;
    }

    const report: WritePlaylistResult['report'] = {
      attempted: videoIds.length,
      added,
      failed: videoIds.length - added,
    };

    if (skipped > 0) {
      report.skipped = skipped;
      report.notes = [`${skipped} track(s) missing YouTube match`];
    }

    return {
      destId: created.id,
      report,
    };
  }
}
