import type { PIFDocument, PIFTrack } from '@app/contracts';

import {
  DEFAULT_PLAYLIST_NAME,
  FileImportError,
  deriveProviderIds,
  ensureTitle,
  ensureTracks,
  secondsToMilliseconds,
  splitArtists,
} from './common';

type PlsEntry = {
  index: number;
  location?: string;
  title?: string;
  length?: number | null;
};

const parseLine = (line: string): { key: string; index: number; value: string } | null => {
  const match = line.match(/^(File|Title|Length)(\d+)=(.*)$/i);
  if (!match) return null;
  const [, key, index, value] = match;
  return {
    key: key.toLowerCase(),
    index: Number(index),
    value: value.trim(),
  };
};

const buildEntries = (lines: string[]): PlsEntry[] => {
  const entries = new Map<number, PlsEntry>();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    const entry = entries.get(parsed.index) ?? { index: parsed.index };
    if (parsed.key === 'file') {
      entry.location = parsed.value;
    } else if (parsed.key === 'title') {
      entry.title = parsed.value;
    } else if (parsed.key === 'length') {
      entry.length = Number(parsed.value);
    }
    entries.set(parsed.index, entry);
  }

  return Array.from(entries.values()).sort((a, b) => a.index - b.index);
};

const toTrack = (entry: PlsEntry, position: number): PIFTrack => {
  if (!entry.location) {
    throw new FileImportError('PLS entry is missing a location');
  }

  if (!entry.title) {
    throw new FileImportError('PLS entry is missing a title');
  }

  let title = entry.title;
  let artists: string[] = [];

  if (entry.title.includes(' - ')) {
    const [artistSegment, titleSegment] = entry.title.split(' - ', 2);
    title = ensureTitle(titleSegment);
    artists = splitArtists(artistSegment);
  } else {
    title = ensureTitle(entry.title);
  }

  if (artists.length === 0) {
    artists = [title];
  }

  const durationMs = secondsToMilliseconds(entry.length ?? null);

  const track: PIFTrack = {
    position,
    title,
    artists,
    album: null,
    duration_ms: durationMs,
    explicit: null,
    release_date: null,
    isrc: null,
    mb_recording_id: null,
    mb_release_id: null,
  };
  const providerIds = deriveProviderIds(entry.location, undefined);
  if (providerIds) {
    track.provider_ids = providerIds;
  }
  return track;
};

export const parsePlsToPif = (input: string): PIFDocument => {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new FileImportError('PLS payload is empty');
  }

  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0]?.toLowerCase() !== '[playlist]') {
    throw new FileImportError('Invalid PLS playlist header');
  }

  const entries = buildEntries(lines);
  if (entries.length === 0) {
    throw new FileImportError('PLS playlist did not contain any tracks');
  }

  const tracks = entries.map((entry, index) => toTrack(entry, index + 1));

  return {
    name: DEFAULT_PLAYLIST_NAME,
    description: null,
    source_service: null,
    source_playlist_id: null,
    tracks: ensureTracks(tracks, 'PLS playlist'),
  };
};
