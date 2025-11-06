import { URL } from 'node:url';

import type { PIFDocument, PIFProviderIds, PIFTrack } from '@app/contracts';

export const DEFAULT_PLAYLIST_NAME = 'Imported playlist';

export type FileImportErrorCode = 'invalid_playlist_file';

export class FileImportError extends Error {
  readonly code: FileImportErrorCode;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'FileImportError';
    this.code = 'invalid_playlist_file';
    this.details = details;
  }
}

export const isFileImportError = (error: unknown): error is FileImportError =>
  error instanceof FileImportError;

export const resolvePlaylistName = (candidate: unknown): string => {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return DEFAULT_PLAYLIST_NAME;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const splitArtists = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];

  const tokens = normalized
    .split(/;|,|(?:\s+&\s+)|(?:\s+feat\.?\s+)|(?:\s+ft\.?\s+)|(?:\s+featuring\s+)/i)
    .map((token) => normalizeWhitespace(token))
    .filter(Boolean);

  return tokens.length > 0 ? tokens : [normalized];
};

export const toNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const parseInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
};

export const parseMilliseconds = (value: unknown): number | null => {
  const num = parseInteger(value);
  if (num === null || num < 0) return null;
  return num;
};

export const secondsToMilliseconds = (value: unknown): number | null => {
  const num = parseInteger(value);
  if (num === null || num < 0) return null;
  return num * 1000;
};

export const parseBooleanFlag = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return null;
};

const sanitizeProviderId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const stripSegment = (segment: string): string =>
  segment.split(/[?#]/, 1)[0]?.trim() ?? segment.trim();

export const parseProviderIdsFromUrl = (url: string | null | undefined): Partial<PIFProviderIds> => {
  if (!url) return {};
  const trimmed = url.trim();
  if (!trimmed) return {};

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const pathSegments = parsed.pathname.split('/').filter(Boolean).map(stripSegment);
    const result: Partial<PIFProviderIds> = {};

    if (host.includes('spotify.com')) {
      const idx = pathSegments.indexOf('track');
      const candidate = idx >= 0 ? pathSegments[idx + 1] : pathSegments[0];
      if (candidate) {
        result.spotify_track_id = stripSegment(candidate);
      }
    } else if (host === 'open.spotify.com') {
      const candidate = pathSegments[1];
      if (pathSegments[0] === 'track' && candidate) {
        result.spotify_track_id = stripSegment(candidate);
      }
    } else if (host === 'spotify') {
      const candidate = pathSegments[pathSegments.length - 1];
      if (candidate) result.spotify_track_id = stripSegment(candidate);
    } else if (host === 'youtu.be') {
      const candidate = pathSegments[0];
      if (candidate) result.youtube_video_id = stripSegment(candidate);
    } else if (host.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) {
        result.youtube_video_id = stripSegment(id);
      }
    } else if (host.includes('tidal.com')) {
      const idx = pathSegments.indexOf('track');
      const candidate = idx >= 0 ? pathSegments[idx + 1] : pathSegments[pathSegments.length - 1];
      if (candidate) result.tidal_track_id = stripSegment(candidate);
    } else if (host.includes('deezer.com')) {
      const idx = pathSegments.indexOf('track');
      const candidate = idx >= 0 ? pathSegments[idx + 1] : pathSegments[pathSegments.length - 1];
      if (candidate) result.deezer_track_id = stripSegment(candidate);
    } else if (host.includes('amazon.com')) {
      const candidate = pathSegments[pathSegments.length - 1];
      if (candidate) result.amazon_track_id = stripSegment(candidate);
    }

    return result;
  } catch {
    return {};
  }
};

const compactProviderIds = (ids: Partial<PIFProviderIds>): PIFProviderIds | undefined => {
  const entries = Object.entries(ids)
    .map(([key, value]) => [key, sanitizeProviderId(value)] as const)
    .filter(([, value]) => value !== null);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as PIFProviderIds;
};

export const deriveProviderIds = (
  url: string | null | undefined,
  explicit?: Partial<PIFProviderIds>,
): PIFProviderIds | undefined => {
  const derived = parseProviderIdsFromUrl(url);
  const merged = {
    ...derived,
    ...(explicit ?? {}),
  };
  return compactProviderIds(merged);
};

export const ensureTracks = <T extends PIFTrack>(tracks: T[], context: string): T[] => {
  if (tracks.length === 0) {
    throw new FileImportError(`${context} did not contain any tracks`);
  }
  return tracks;
};

export const ensureTitle = (value: string | null | undefined): string => {
  if (!value) {
    throw new FileImportError('Playlist item is missing a title');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new FileImportError('Playlist item is missing a title');
  }
  return trimmed;
};

export const basePifDocument = (name: string): PIFDocument => ({
  name: resolvePlaylistName(name),
  description: null,
  source_service: null,
  source_playlist_id: null,
  tracks: [],
});
