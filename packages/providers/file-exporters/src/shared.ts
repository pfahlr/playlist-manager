import { type PIFProviderIds, type PIFTrack } from '@app/contracts';

type ProviderResolver = {
  key: keyof PIFProviderIds;
  buildUrl: (id: string) => string;
};

const PROVIDER_PRIORITY: ProviderResolver[] = [
  { key: 'spotify_track_id', buildUrl: (id) => `https://open.spotify.com/track/${id}` },
  { key: 'deezer_track_id', buildUrl: (id) => `https://www.deezer.com/track/${id}` },
  { key: 'tidal_track_id', buildUrl: (id) => `https://tidal.com/browse/track/${id}` },
  { key: 'youtube_video_id', buildUrl: (id) => `https://www.youtube.com/watch?v=${id}` },
  { key: 'amazon_track_id', buildUrl: (id) => `https://music.amazon.com/tracks/${id}` },
];

export const resolveTrackLocation = (track: PIFTrack): string | null => {
  const providerIds: PIFProviderIds | undefined | null = track.provider_ids;
  if (!providerIds) {
    return null;
  }

  for (const provider of PROVIDER_PRIORITY) {
    const value = providerIds[provider.key];
    if (typeof value === 'string' && value.length > 0) {
      return provider.buildUrl(value);
    }
  }

  return null;
};

export const joinArtists = (artists: string[], separator: string): string =>
  artists.join(separator);
