import { randomUUID } from 'crypto';

interface Playlist {
  id: number;
  name: string;
  provider: string | null;
  provider_playlist_id: string | null;
  updated_at: string | null;
}

interface PlaylistItem {
  id: number;
  position: number | null;
  title: string;
  artists: string;
  album: string | null;
  duration_ms: number | null;
  recording_id: number | null;
  isrc: string | null;
  mb_recording_id: string | null;
  mb_release_id: string | null;
  provider_track_id: string | null;
}

interface ActivePlaylist {
  playlist_id: number | null;
  updated_at: string;
}

interface Job {
  id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  report: {
    matched_isrc_pct: number;
    matched_fuzzy_pct: number;
    unresolved: Array<Record<string, unknown>>;
  };
  artifact_url: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Artist {
  mbid: string;
  name: string;
  bio: null | {
    source: string;
    summary: string | null;
    url: string | null;
  };
  links: Array<{ kind: string; url: string }>;
  updated_at: string | null;
}

const toISOString = () => new Date().toISOString();

const samplePlaylists: Playlist[] = [
  {
    id: 101,
    name: 'Indie Essentials',
    provider: 'spotify',
    provider_playlist_id: '37i9dQZF1DX2Nc3B70tvx0',
    updated_at: toISOString(),
  },
  {
    id: 102,
    name: 'Deep Focus Mix',
    provider: 'deezer',
    provider_playlist_id: '987654321',
    updated_at: toISOString(),
  },
];

const playlistItems: PlaylistItem[] = [
  {
    id: 4001,
    position: 1,
    title: 'Losing My Religion',
    artists: 'R.E.M.',
    album: 'Out of Time',
    duration_ms: 269000,
    recording_id: 5551,
    isrc: 'USWB19902945',
    mb_recording_id: 'b8d0d7c0-8e1c-4b34-8bc3-38d78a0c2b1f',
    mb_release_id: 'b7a6d2e4-1c77-4a9f-9d5b-0c3b2ea0f4a1',
    provider_track_id: '3urbQpVxWn',
  },
  {
    id: 4002,
    position: 2,
    title: 'Hurt',
    artists: 'Nine Inch Nails',
    album: 'The Downward Spiral',
    duration_ms: 371000,
    recording_id: 5552,
    isrc: 'USIR19400383',
    mb_recording_id: 'f2d9f7d3-7a61-485f-9b1e-2f4d8b3b7d1a',
    mb_release_id: '9c0b3c90-1e37-4b9b-8c7e-9b7a86a1e5fd',
    provider_track_id: '9zYpqAbC12',
  },
];

let nextItemId = 5000;
let etagValue = 'W/"playlist-items"';

let activePlaylist: ActivePlaylist = {
  playlist_id: samplePlaylists[0]?.id ?? null,
  updated_at: toISOString(),
};

function newJob(status: Job['status'] = 'queued'): Job {
  const iso = toISOString();
  return {
    id: Math.floor(Math.random() * 1_000_000),
    status,
    report: {
      matched_isrc_pct: 0,
      matched_fuzzy_pct: 0,
      unresolved: [],
    },
    artifact_url: null,
    created_at: iso,
    updated_at: iso,
  };
}

const jobs = new Map<number, Job>();
const followedArtists = new Set<string>();

export function listPlaylists() {
  return { data: samplePlaylists, next_cursor: null };
}

export function getPlaylist(id: number) {
  const base = samplePlaylists.find((p) => p.id === id) ?? samplePlaylists[0];
  return { ...base, id };
}

export function getPlaylistItems(playlistId: number) {
  return {
    etag: etagValue,
    items: playlistItems.map((item, idx) => ({
      ...item,
      position: idx + 1,
    })),
  };
}

export function appendPlaylistItem(payload: Record<string, unknown>) {
  const id = nextItemId++;
  const iso = toISOString();
  const baseTitle = (payload?.title as string) ?? 'Imported track';
  const newItem: PlaylistItem = {
    id,
    position: playlistItems.length + 1,
    title: baseTitle,
    artists: (payload?.primary_artist as string) ?? 'Unknown Artist',
    album: (payload?.title as string) ? `${baseTitle} (Single)` : 'Imported Mix',
    duration_ms: typeof payload?.recording_id === 'number' ? 180_000 : 0,
    recording_id: (payload?.recording_id as number) ?? 0,
    isrc: (payload?.isrc as string) ?? 'UNKNOWN000000',
    mb_recording_id: '00000000-0000-0000-0000-000000000000',
    mb_release_id: '00000000-0000-0000-0000-000000000000',
    provider_track_id: randomUUID().slice(0, 10),
  };
  playlistItems.push(newItem);
  etagValue = `W/"playlist-items-${iso}"`;
  return newItem;
}

export function removePlaylistItem(itemId: number) {
  const index = playlistItems.findIndex((item) => item.id === itemId);
  if (index >= 0) {
    playlistItems.splice(index, 1);
  }
}

export function getActivePlaylist() {
  return { ...activePlaylist };
}

export function setActivePlaylist(playlistId: number | null) {
  activePlaylist = {
    playlist_id: playlistId,
    updated_at: toISOString(),
  };
}

export function enqueueJob(kind: 'migrate' | 'export') {
  const job = newJob('queued');
  jobs.set(job.id, job);
  return { jobRef: { job_id: job.id, status: job.status }, job };
}

export function getJob(id: number) {
  if (!jobs.has(id)) {
    const job = newJob('succeeded');
    job.id = id;
    job.status = 'succeeded';
    job.report = {
      matched_isrc_pct: 0.84,
      matched_fuzzy_pct: 0.12,
      unresolved: [],
    };
    job.artifact_url = 'https://example.com/artifacts/demo.csv';
    jobs.set(id, job);
  }
  return jobs.get(id)!;
}

export function followArtist(mbid: string) {
  followedArtists.add(mbid.toLowerCase());
}

export function unfollowArtist(mbid: string) {
  followedArtists.delete(mbid.toLowerCase());
}

export function hasArtist(mbid: string) {
  return followedArtists.has(mbid.toLowerCase());
}

export function getArtist(mbid: string): Artist {
  return {
    mbid,
    name: 'Sample Artist',
    bio: {
      source: 'musicbrainz',
      summary: 'An example artist used for contract tests.',
      url: 'https://musicbrainz.org/artist/123e4567-e89b-12d3-a456-426614174000',
    },
    links: [
      { kind: 'homepage', url: 'https://example.com/artists/sample' },
      { kind: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Example' },
    ],
    updated_at: toISOString(),
  };
}

export function getArtistRelations(mbid: string) {
  return {
    data: [
      {
        type: 'influences',
        artist: {
          mbid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Influential Artist',
        },
      },
      {
        type: 'collaborated_with',
        artist: {
          mbid: 'abcdefab-1234-5678-90ab-abcdefabcdef',
          name: 'Collaborator',
        },
      },
    ],
  };
}
