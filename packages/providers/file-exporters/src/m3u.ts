import { type PIFDocument, type PIFTrack } from '@app/contracts';

import { joinArtists, resolveTrackLocation } from './shared.ts';

const ARTIST_SEPARATOR = ' & ';

const formatDurationSeconds = (duration: number | null | undefined): number => {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return -1;
  }

  const seconds = Math.round(duration / 1000);
  return seconds >= 0 ? seconds : -1;
};

const formatExtInf = (track: PIFTrack): string => {
  const duration = formatDurationSeconds(track.duration_ms);
  const artists = joinArtists(track.artists, ARTIST_SEPARATOR);
  return `#EXTINF:${duration},${artists} - ${track.title}`;
};

const trackLocation = (track: PIFTrack): string =>
  resolveTrackLocation(track) ?? track.title;

export const renderM3U = (playlist: PIFDocument): string => {
  const lines: string[] = ['#EXTM3U'];

  for (const track of playlist.tracks) {
    lines.push(formatExtInf(track));
    lines.push(trackLocation(track));
  }

  return `${lines.join('\n')}\n`;
};
