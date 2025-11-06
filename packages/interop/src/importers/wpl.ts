import { XMLParser } from 'fast-xml-parser';

import type { PIFDocument, PIFTrack } from '@app/contracts';

import {
  DEFAULT_PLAYLIST_NAME,
  FileImportError,
  deriveProviderIds,
  ensureTitle,
  ensureTracks,
  parseMilliseconds,
  resolvePlaylistName,
  splitArtists,
  toNull,
} from './common';

type WplParam = {
  name?: string;
  value?: string;
  Value?: string;
};

type WplMediaNode = {
  src?: string;
  href?: string;
  Title?: string;
  param?: WplParam | WplParam[];
};

type WplDocument = {
  smil?: {
    head?: {
      title?: string;
    };
    body?: {
      seq?: {
        media?: WplMediaNode | WplMediaNode[];
      };
    };
  };
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  ignoreDeclaration: true,
  isArray: (name) => name === 'media' || name === 'param',
});

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const paramLookup = (params: WplParam[], key: string): string | null => {
  const candidate = params.find(
    (param) => param.name?.toLowerCase() === key.toLowerCase(),
  );
  if (!candidate) return null;
  return toNull(candidate.value ?? candidate.Value);
};

const mapMediaNode = (node: WplMediaNode, index: number): PIFTrack => {
  const src = toNull(node.src ?? node.href);
  if (!src) {
    throw new FileImportError('WPL media entry is missing a source URL');
  }

  const paramArray = asArray(node.param);
  const titleValue =
    toNull(node.Title) ??
    paramLookup(paramArray, 'title') ??
    paramLookup(paramArray, 'name');
  const title = ensureTitle(titleValue);

  const artistValue =
    paramLookup(paramArray, 'author') ?? paramLookup(paramArray, 'artist');
  const artists = splitArtists(artistValue ?? '');
  const album = paramLookup(paramArray, 'albumtitle') ?? paramLookup(paramArray, 'album');
  const durationMs = parseMilliseconds(paramLookup(paramArray, 'duration'));

  const track: PIFTrack = {
    position: index + 1,
    title,
    artists: artists.length > 0 ? artists : [title],
    album,
    duration_ms: durationMs,
    explicit: null,
    release_date: null,
    isrc: null,
    mb_recording_id: null,
    mb_release_id: null,
  };
  const providerIds = deriveProviderIds(src, undefined);
  if (providerIds) {
    track.provider_ids = providerIds;
  }
  return track;
};

export const parseWplToPif = (input: string): PIFDocument => {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new FileImportError('WPL payload is empty');
  }

  let parsed: WplDocument;
  try {
    parsed = xmlParser.parse(input) as WplDocument;
  } catch (error) {
    throw new FileImportError('Invalid WPL XML', { error: (error as Error).message });
  }

  const smil = parsed.smil;
  if (!smil || !smil.body || !smil.body.seq) {
    throw new FileImportError('WPL playlist is missing media entries');
  }

  const mediaNodes = asArray(smil.body.seq.media);
  if (mediaNodes.length === 0) {
    throw new FileImportError('WPL playlist did not contain any tracks');
  }

  const tracks = mediaNodes.map(mapMediaNode);

  const playlistName = smil.head?.title ?? DEFAULT_PLAYLIST_NAME;

  return {
    name: resolvePlaylistName(playlistName),
    description: null,
    source_service: null,
    source_playlist_id: null,
    tracks: ensureTracks(tracks, 'WPL playlist'),
  };
};
