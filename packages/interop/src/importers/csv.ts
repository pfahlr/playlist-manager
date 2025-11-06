import Ajv, { type ValidateFunction } from 'ajv';
import { createRequire } from 'node:module';

import type { PIFDocument, PIFProviderIds, PIFTrack } from '@app/contracts';

import {
  DEFAULT_PLAYLIST_NAME,
  FileImportError,
  deriveProviderIds,
  ensureTitle,
  ensureTracks,
  parseBooleanFlag,
  parseMilliseconds,
  parseInteger,
  splitArtists,
  toNull,
} from './common';

const require = createRequire(import.meta.url);

const leanSchema = require('../../../../schemas/csv/playlist.lean.json') as object;
const verboseSchema = require('../../../../schemas/csv/playlist.verbose.json') as object;

type JsonObject = Record<string, unknown>;

type CsvVariant = 'lean' | 'verbose';

type CsvRow = {
  position: number | null;
  title: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  isrc: string | null;
  explicit: boolean | null;
  releaseDate: string | null;
  mbRecordingId: string | null;
  mbReleaseId: string | null;
  providerIds: Partial<PIFProviderIds> | undefined;
  sourceService: string | null;
  sourcePlaylistId: string | null;
};

const normalizeRef = (ref: string): string =>
  ref.startsWith('#/$defs/') ? ref.replace('#/$defs/', '#/definitions/') : ref;

const downgradeSchemaDraft = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map(downgradeSchemaDraft);
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as JsonObject).reduce<JsonObject>((acc, [key, value]) => {
      const normalizedKey = key === '$defs' ? 'definitions' : key;
      let nextValue = downgradeSchemaDraft(value);
      if (normalizedKey === '$ref' && typeof nextValue === 'string') {
        nextValue = normalizeRef(nextValue);
      }
      acc[normalizedKey] = nextValue;
      return acc;
    }, {});
  }
  if (typeof node === 'string') {
    return normalizeRef(node);
  }
  return node;
};

const compileValidator = (schemaSource: object): ValidateFunction => {
  try {
    const Ajv2020 = require('ajv/dist/2020').default as typeof Ajv;
    const ajv2020 = new Ajv2020({
      allErrors: true,
      coerceTypes: true,
      strict: false,
      allowUnionTypes: true,
    });
    return ajv2020.compile(schemaSource);
  } catch {
    const fallbackSchema = downgradeSchemaDraft(schemaSource) as JsonObject;
    fallbackSchema.$schema = 'http://json-schema.org/draft-07/schema#';
    const ajvLegacy = new Ajv({
      allErrors: true,
      coerceTypes: true,
      removeAdditional: false,
      schemaId: 'auto',
      jsonPointers: true,
    });
    return ajvLegacy.compile(fallbackSchema);
  }
};

const validateLean = compileValidator(leanSchema);
const validateVerbose = compileValidator(verboseSchema);

const VERBOSE_COLUMNS = new Set([
  'release_date',
  'disc_number',
  'track_number',
  'explicit',
  'mb_recording_id',
  'mb_release_id',
  'mb_release_group_id',
  'mb_artist_ids',
  'spotify_track_id',
  'deezer_track_id',
  'tidal_track_id',
  'youtube_video_id',
  'amazon_track_id',
  'upc',
  'iswc',
  'genres',
  'source_service',
  'source_playlist_id',
]);

const sanitizeBOM = (input: string): string =>
  input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

const parseCsvRows = (input: string): string[][] => {
  const rows: string[][] = [];
  let field = '';
  const current: string[][] = [[]];
  let inQuotes = false;
  const pushField = () => {
    current[current.length - 1].push(field);
    field = '';
  };
  const pushRow = () => {
    const row = current[current.length - 1];
    // Skip rows that are entirely empty
    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row);
    }
    current.push([]);
  };

  const data = sanitizeBOM(input);

  for (let i = 0; i < data.length; i += 1) {
    const char = data[i];
    if (inQuotes) {
      if (char === '"') {
        const next = data[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      pushField();
      continue;
    }

    if (char === '\r') {
      const next = data[i + 1];
      pushField();
      pushRow();
      if (next === '\n') {
        i += 1;
      }
      continue;
    }

    if (char === '\n') {
      pushField();
      pushRow();
      continue;
    }

    field += char;
  }

  // Push trailing field/row if we accumulated data
  if (field.length > 0 || current[current.length - 1].length > 0) {
    pushField();
    pushRow();
  }

  return rows;
};

const detectVariant = (header: string[]): CsvVariant => {
  const normalized = header.map((column) => column.trim());
  const hasVerboseSpecific = normalized.some((column) => VERBOSE_COLUMNS.has(column));
  if (hasVerboseSpecific) {
    return 'verbose';
  }

  if (normalized.includes('primary_artist')) {
    return 'lean';
  }

  // Fall back to lean when only lean-compatible columns exist
  return 'lean';
};

const normalizeHeader = (header: string[]): string[] =>
  header.map((column) => column.trim());

const REQUIRED_COLUMNS: Record<CsvVariant, Set<string>> = {
  lean: new Set(['position', 'title', 'artists', 'album', 'duration_ms', 'isrc']),
  verbose: new Set(['position', 'title', 'artists', 'album', 'duration_ms']),
};

const buildRowRecord = (
  header: string[],
  values: string[],
  variant: CsvVariant,
): Record<string, string | null> => {
  const record: Record<string, string | null> = {};
  header.forEach((column, index) => {
    const raw = values[index] ?? '';
    const trimmed = raw.trim();
    const value = trimmed.length > 0 ? trimmed : null;
    if (value === null && !REQUIRED_COLUMNS[variant].has(column)) {
      return;
    }
    record[column] = value;
  });
  return record;
};

const validateRecord = (
  record: Record<string, string | null>,
  variant: CsvVariant,
  lineNumber: number,
) => {
  const validator = variant === 'verbose' ? validateVerbose : validateLean;
  if (!validator(record)) {
    throw new FileImportError('Invalid CSV row', {
      line: lineNumber,
      errors: validator.errors,
    });
  }
};

const parseArtistsField = (value: string): string[] => {
  const artists = splitArtists(value);
  if (artists.length === 0) {
    throw new FileImportError('CSV row is missing artist metadata');
  }
  return artists;
};

const mapProviderIds = (
  record: Record<string, string | null>,
): Partial<PIFProviderIds> | undefined => {
  const providerIds: Partial<PIFProviderIds> = {};
  const spotify = sanitize(record.spotify_track_id);
  const deezer = sanitize(record.deezer_track_id);
  const tidal = sanitize(record.tidal_track_id);
  const youtube = sanitize(record.youtube_video_id);
  const amazon = sanitize(record.amazon_track_id);

  if (spotify) providerIds.spotify_track_id = spotify;
  if (deezer) providerIds.deezer_track_id = deezer;
  if (tidal) providerIds.tidal_track_id = tidal;
  if (youtube) providerIds.youtube_video_id = youtube;
  if (amazon) providerIds.amazon_track_id = amazon;

  return Object.keys(providerIds).length > 0 ? providerIds : undefined;
};

const sanitize = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toCsvRow = (
  record: Record<string, string | null>,
  variant: CsvVariant,
  index: number,
): CsvRow => {
  const artistsSource = record.artists ?? record.primary_artist;
  if (!artistsSource) {
    throw new FileImportError('CSV row is missing artist metadata');
  }
  const artists = parseArtistsField(artistsSource);
  const position = parseInteger(record.position);

  const baseRow: CsvRow = {
    position: position !== null && position > 0 ? position : index + 1,
    title: ensureTitle(record.title),
    artists,
    album: toNull(record.album ?? null),
    durationMs: parseMilliseconds(record.duration_ms ?? null),
    isrc: toNull(record.isrc ?? null),
    explicit: null,
    releaseDate: null,
    mbRecordingId: toNull(record.mb_recording_id ?? null),
    mbReleaseId: toNull(record.mb_release_id ?? null),
    providerIds: undefined,
    sourceService: toNull(record.source_service ?? null),
    sourcePlaylistId: toNull(record.source_playlist_id ?? null),
  };

  if (variant === 'verbose') {
    baseRow.explicit = parseBooleanFlag(record.explicit ?? null);
    baseRow.releaseDate = toNull(record.release_date ?? null);
    baseRow.providerIds = mapProviderIds(record);
  }

  return baseRow;
};

const reduceSourceMetadata = (rows: CsvRow[]): { service: string | null; playlistId: string | null } => {
  const service = rows.map((row) => row.sourceService).find((value) => value !== null) ?? null;
  const playlistId =
    rows.map((row) => row.sourcePlaylistId).find((value) => value !== null) ?? null;
  return { service, playlistId };
};

const toPifTrack = (row: CsvRow): PIFTrack => {
  const providerIds = row.providerIds ? deriveProviderIds(null, row.providerIds) : undefined;
  const track: PIFTrack = {
    position: row.position ?? 0,
    title: row.title,
    artists: row.artists,
    album: row.album,
    duration_ms: row.durationMs,
    explicit: row.explicit,
    release_date: row.releaseDate,
    isrc: row.isrc,
    mb_recording_id: row.mbRecordingId,
    mb_release_id: row.mbReleaseId,
  };
  if (providerIds) {
    track.provider_ids = providerIds;
  }
  return track;
};

export const parseCsvToPif = (csv: string): PIFDocument => {
  if (typeof csv !== 'string' || csv.trim().length === 0) {
    throw new FileImportError('CSV payload is empty');
  }

  const rows = parseCsvRows(csv);
  if (rows.length === 0) {
    throw new FileImportError('CSV payload did not contain data');
  }

  const [headerRow, ...dataRows] = rows;
  const header = normalizeHeader(headerRow);
  const variant = detectVariant(header);
  const nonEmptyRows = dataRows.filter((row) => row.some((field) => field.trim().length > 0));

  if (nonEmptyRows.length === 0) {
    throw new FileImportError('CSV payload did not contain any tracks');
  }

  const normalizedRows: CsvRow[] = nonEmptyRows.map((values, index) => {
    const record = buildRowRecord(header, values, variant);
    validateRecord(record, variant, index + 2); // header is line 1
    return toCsvRow(record, variant, index);
  });

  const { service, playlistId } = reduceSourceMetadata(normalizedRows);
  const tracks = ensureTracks(
    normalizedRows.map(toPifTrack),
    'CSV playlist',
  );

  return {
    name: DEFAULT_PLAYLIST_NAME,
    description: null,
    source_service: service,
    source_playlist_id: playlistId,
    tracks,
  };
};
