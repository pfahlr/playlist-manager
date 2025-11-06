import type { PIFDocument, PIFTrack } from '@app/contracts';

import {
  DEFAULT_PLAYLIST_NAME,
  FileImportError,
  deriveProviderIds,
  ensureTracks,
  ensureTitle,
  resolvePlaylistName,
  secondsToMilliseconds,
  splitArtists,
} from './common';

type PendingTrack = {
  title: string;
  artists: string[];
  durationMs: number | null;
  album: string | null;
};

const parseExtinfLine = (line: string): PendingTrack => {
  const payload = line.slice('#EXTINF:'.length);
  const [durationPart, metaPart] = payload.split(',', 2);
  const durationMs = secondsToMilliseconds(durationPart ?? null);
  const meta = (metaPart ?? '').trim();

  if (!meta) {
    throw new FileImportError('M3U track entry is missing metadata');
  }

  let title: string;
  let artists: string[] = [];

  if (meta.includes(' - ')) {
    const [artistSegment, titleSegment] = meta.split(' - ', 2);
    title = ensureTitle(titleSegment);
    artists = splitArtists(artistSegment);
  } else {
    title = ensureTitle(meta);
  }

  if (artists.length === 0) {
    artists = [title];
  }

  return {
    title,
    artists,
    durationMs: durationMs ?? null,
    album: null,
  };
};

export const parseM3uToPif = (input: string): PIFDocument => {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new FileImportError('M3U payload is empty');
  }

  const lines = input.split(/\r?\n/).map((line) => line.trim());
  if (!lines.some((line) => line.startsWith('#EXTM3U'))) {
    throw new FileImportError('Invalid M3U playlist header');
  }

  let playlistName = DEFAULT_PLAYLIST_NAME;
  let albumForNext: string | null = null;
  let pending: PendingTrack | null = null;
  const tracks: PIFTrack[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      continue;
    }

    if (line.startsWith('#PLAYLIST:')) {
      playlistName = resolvePlaylistName(line.slice('#PLAYLIST:'.length));
      continue;
    }

    if (line.startsWith('#EXTALB:')) {
      albumForNext = line.slice('#EXTALB:'.length).trim() || null;
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      pending = parseExtinfLine(line);
      if (albumForNext !== null) {
        pending.album = albumForNext;
        albumForNext = null;
      }
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    if (!pending) {
      throw new FileImportError('Encountered playlist location without EXTINF metadata');
    }

    const providerIds = deriveProviderIds(line, undefined);
    const track: PIFTrack = {
      position: tracks.length + 1,
      title: pending.title,
      artists: pending.artists,
      album: pending.album ?? null,
      duration_ms: pending.durationMs,
      explicit: null,
      release_date: null,
      isrc: null,
      mb_recording_id: null,
      mb_release_id: null,
    };
    if (providerIds) {
      track.provider_ids = providerIds;
    }
    tracks.push(track);

    pending = null;
    albumForNext = null;
  }

  if (pending) {
    throw new FileImportError('EXTINF metadata without a following location entry');
  }

  return {
    name: resolvePlaylistName(playlistName),
    description: null,
    source_service: null,
    source_playlist_id: null,
    tracks: ensureTracks(tracks, 'M3U playlist'),
  };
};
