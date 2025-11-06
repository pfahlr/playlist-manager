import { type PIFDocument, type PIFTrack } from '@app/contracts';

import { joinArtists, resolveTrackLocation } from './shared.ts';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const pushTag = (
  lines: string[],
  indent: string,
  tagName: string,
  value: string | null | undefined,
) => {
  if (value === null || value === undefined || value === '') {
    return;
  }

  lines.push(`${indent}<${tagName}>${escapeXml(value)}</${tagName}>`);
};

const pushTrack = (lines: string[], track: PIFTrack) => {
  lines.push('    <track>');
  pushTag(lines, '      ', 'title', track.title);
  pushTag(lines, '      ', 'creator', joinArtists(track.artists, '; '));
  pushTag(lines, '      ', 'album', track.album ?? undefined);

  if (track.duration_ms !== null && track.duration_ms !== undefined) {
    pushTag(lines, '      ', 'duration', String(track.duration_ms));
  }

  const location = resolveTrackLocation(track);
  pushTag(lines, '      ', 'location', location ?? undefined);
  lines.push('    </track>');
};

export const renderXSPF = (playlist: PIFDocument): string => {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
  ];

  pushTag(lines, '  ', 'title', playlist.name);
  pushTag(lines, '  ', 'annotation', playlist.description ?? undefined);

  lines.push('  <trackList>');
  for (const track of playlist.tracks) {
    pushTrack(lines, track);
  }
  lines.push('  </trackList>');
  lines.push('</playlist>');

  return `${lines.join('\n')}\n`;
};
