import { XMLParser } from 'fast-xml-parser';

import type { PIFDocument, PIFTrack } from '@app/contracts';

import {
  DEFAULT_PLAYLIST_NAME,
  FileImportError,
  deriveProviderIds,
  ensureTracks,
  ensureTitle,
  parseMilliseconds,
  resolvePlaylistName,
  splitArtists,
} from './common';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  ignoreDeclaration: true,
  isArray: (name) => name === 'track' || name === 'location',
});

type XSPFTrackNode = {
  title?: string;
  creator?: string;
  album?: string;
  duration?: string | number;
  location?: string | string[];
};

type XSPFDocument = {
  playlist?: {
    title?: string;
    trackList?: {
      track?: XSPFTrackNode | XSPFTrackNode[];
    };
  };
};

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const resolveLocation = (node: XSPFTrackNode): string | null => {
  if (!node.location) return null;
  if (Array.isArray(node.location)) {
    return node.location.find((entry) => typeof entry === 'string') ?? null;
  }
  return typeof node.location === 'string' ? node.location : null;
};

const mapTrack = (node: XSPFTrackNode, index: number): PIFTrack => {
  const title = ensureTitle(node.title);
  const artistsSource = node.creator ?? '';
  const artists = splitArtists(artistsSource);
  const durationMs = parseMilliseconds(node.duration ?? null);
  const location = resolveLocation(node);
  const providerIds = deriveProviderIds(location, undefined);

  const track: PIFTrack = {
    position: index + 1,
    title,
    artists: artists.length > 0 ? artists : [title],
    album: node.album ?? null,
    duration_ms: durationMs,
    explicit: null,
    release_date: null,
    isrc: null,
    mb_recording_id: null,
    mb_release_id: null,
  };
  if (providerIds) {
    track.provider_ids = providerIds;
  }
  return track;
};

export const parseXspfToPif = (input: string): PIFDocument => {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new FileImportError('XSPF payload is empty');
  }

  let parsed: XSPFDocument;
  try {
    parsed = xmlParser.parse(input) as XSPFDocument;
  } catch (error) {
    throw new FileImportError('Invalid XSPF XML', { error: (error as Error).message });
  }

  const playlist = parsed.playlist;
  if (!playlist || !playlist.trackList) {
    throw new FileImportError('XSPF playlist is missing track data');
  }

  const tracks = asArray(playlist.trackList.track).map(mapTrack);

  return {
    name: resolvePlaylistName(playlist.title ?? DEFAULT_PLAYLIST_NAME),
    description: null,
    source_service: null,
    source_playlist_id: null,
    tracks: ensureTracks(tracks, 'XSPF playlist'),
  };
};
