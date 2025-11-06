import { type PIFDocument, type PIFProviderIds, type PIFTrack } from '@app/contracts';
import { createRequire } from 'node:module';

import { joinArtists } from './shared.ts';

export type CsvVariant = 'lean' | 'verbose';

type CsvSchema = {
  'x-csv'?: {
    columnOrder?: string[];
  };
};

type CsvRow = Record<string, string>;

const require = createRequire(import.meta.url);

const leanSchema = require('../../../../schemas/csv/playlist.lean.json') as CsvSchema;
const verboseSchema = require('../../../../schemas/csv/playlist.verbose.json') as CsvSchema;

const FALLBACK_LEAN_COLUMNS = [
  'position',
  'title',
  'artists',
  'album',
  'duration_ms',
  'isrc',
] as const;

const FALLBACK_VERBOSE_COLUMNS = [
  'position',
  'title',
  'artists',
  'album',
  'release_date',
  'disc_number',
  'track_number',
  'duration_ms',
  'explicit',
  'isrc',
  'mb_recording_id',
  'mb_release_id',
  'mb_release_group_id',
  'mb_artist_ids',
  'spotify_track_id',
  'spotify_album_id',
  'deezer_track_id',
  'deezer_album_id',
  'tidal_track_id',
  'tidal_album_id',
  'youtube_video_id',
  'amazon_track_id',
  'upc',
  'iswc',
  'genres',
  'source_service',
  'source_playlist_id',
] as const;

const COLUMN_ORDERS: Record<CsvVariant, string[]> = {
  lean: leanSchema['x-csv']?.columnOrder ?? [...FALLBACK_LEAN_COLUMNS],
  verbose: verboseSchema['x-csv']?.columnOrder ?? [...FALLBACK_VERBOSE_COLUMNS],
};

const NEWLINE = '\r\n';
const SPECIAL_CHARS_REGEX = /[",\r\n]/;

const quoteValue = (value: string): string => {
  if (value === '') {
    return '';
  }

  return SPECIAL_CHARS_REGEX.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

const stringOrEmpty = (value: string | null | undefined): string => value ?? '';

const numberOrEmpty = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

const booleanOrEmpty = (value: boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return value ? 'true' : 'false';
};

const pickProvider = (
  providerIds: PIFProviderIds | undefined,
  key: keyof PIFProviderIds,
): string => {
  const value = providerIds?.[key];
  return typeof value === 'string' ? value : '';
};

const buildLeanRow = (track: PIFTrack): CsvRow => ({
  position: String(track.position),
  title: track.title,
  artists: joinArtists(track.artists, '; '),
  album: stringOrEmpty(track.album),
  duration_ms: numberOrEmpty(track.duration_ms),
  isrc: stringOrEmpty(track.isrc),
});

const buildVerboseRow = (playlist: PIFDocument, track: PIFTrack): CsvRow => {
  const providerIds = track.provider_ids;

  return {
    position: String(track.position),
    title: track.title,
    artists: joinArtists(track.artists, '; '),
    album: stringOrEmpty(track.album),
    release_date: stringOrEmpty(track.release_date),
    disc_number: '',
    track_number: '',
    duration_ms: numberOrEmpty(track.duration_ms),
    explicit: booleanOrEmpty(track.explicit),
    isrc: stringOrEmpty(track.isrc),
    mb_recording_id: stringOrEmpty(track.mb_recording_id),
    mb_release_id: stringOrEmpty(track.mb_release_id),
    mb_release_group_id: '',
    mb_artist_ids: '',
    spotify_track_id: pickProvider(providerIds, 'spotify_track_id'),
    spotify_album_id: '',
    deezer_track_id: pickProvider(providerIds, 'deezer_track_id'),
    deezer_album_id: '',
    tidal_track_id: pickProvider(providerIds, 'tidal_track_id'),
    tidal_album_id: '',
    youtube_video_id: pickProvider(providerIds, 'youtube_video_id'),
    amazon_track_id: pickProvider(providerIds, 'amazon_track_id'),
    upc: '',
    iswc: '',
    genres: '',
    source_service: stringOrEmpty(playlist.source_service),
    source_playlist_id: stringOrEmpty(playlist.source_playlist_id),
  };
};

const rowForVariant = (
  playlist: PIFDocument,
  track: PIFTrack,
  variant: CsvVariant,
): CsvRow =>
  variant === 'lean' ? buildLeanRow(track) : buildVerboseRow(playlist, track);

const renderRow = (row: CsvRow, columns: string[]): string =>
  columns.map((column) => quoteValue(row[column] ?? '')).join(',');

export const renderCsv = (
  playlist: PIFDocument,
  variant: CsvVariant = 'lean',
): string => {
  const columns = COLUMN_ORDERS[variant];
  const lines: string[] = [columns.join(',')];

  for (const track of playlist.tracks) {
    const row = rowForVariant(playlist, track, variant);
    lines.push(renderRow(row, columns));
  }

  return `${lines.join(NEWLINE)}${NEWLINE}`;
};
