/**
 * MusicBrainz enrichment service
 *
 * Resolves MBIDs (MusicBrainz IDs) for recordings and artists
 * by querying the MusicBrainz API with caching and rate limiting.
 */

import { prisma } from '@app/db';

/**
 * Input for MBID resolution
 */
export interface MBIDResolutionInput {
  title: string;
  artists: string[];
  duration_ms?: number;
}

/**
 * Resolved MBIDs from MusicBrainz
 */
export interface MBIDResolutionResult {
  mb_recording_id: string;
  mb_artist_ids: string[];
  title: string;
  artists: string[];
  duration_ms: number | null;
}

/**
 * MusicBrainz API response types
 */
interface MBArtistCredit {
  name: string;
  artist?: {
    id: string;
    name: string;
  };
}

interface MBRecording {
  id: string;
  title: string;
  length?: number; // Duration in milliseconds
  'artist-credit'?: MBArtistCredit[];
}

interface MBRecordingSearchResponse {
  recordings: MBRecording[];
  count?: number;
}

/**
 * Rate limiter for MusicBrainz API (1 req/sec)
 */
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;

  constructor(requestsPerSecond: number = 1) {
    this.minIntervalMs = 1000 / requestsPerSecond;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new RateLimiter(1); // 1 request per second

/**
 * Query MusicBrainz API for recording search
 */
async function searchMusicBrainzRecordings(
  title: string,
  artist: string
): Promise<MBRecordingSearchResponse> {
  await rateLimiter.throttle();

  const query = `recording:"${title}" AND artist:"${artist}"`;
  const url = new URL('https://musicbrainz.org/ws/2/recording');
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '10');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'PlaylistManager/1.0.0 (contact@example.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Find best matching recording based on duration
 * Picks recording within ±2 seconds of target duration
 */
function findBestMatch(
  recordings: MBRecording[],
  targetDurationMs: number | undefined
): MBRecording | null {
  if (recordings.length === 0) {
    return null;
  }

  // If no duration provided, return first result
  if (targetDurationMs === undefined) {
    return recordings[0];
  }

  const DURATION_TOLERANCE_MS = 2000; // ±2 seconds

  // Filter recordings within tolerance
  const matchingRecordings = recordings.filter((rec) => {
    if (!rec.length) return false;
    const diff = Math.abs(rec.length - targetDurationMs);
    return diff <= DURATION_TOLERANCE_MS;
  });

  // Return closest match or null if none within tolerance
  if (matchingRecordings.length === 0) {
    return null;
  }

  // Sort by closest duration match
  matchingRecordings.sort((a, b) => {
    const diffA = Math.abs((a.length || 0) - targetDurationMs);
    const diffB = Math.abs((b.length || 0) - targetDurationMs);
    return diffA - diffB;
  });

  return matchingRecordings[0];
}

/**
 * Check database cache for existing MBID
 */
async function checkCache(
  title: string,
  artists: string[]
): Promise<MBIDResolutionResult | null> {
  // Normalize title for lookup
  const normalizedTitle = title.trim().toLowerCase();
  const primaryArtist = artists[0]?.trim().toLowerCase();

  if (!primaryArtist) {
    return null;
  }

  // Check if we have a cached recording
  const recording = await prisma.recording.findFirst({
    where: {
      title: {
        equals: normalizedTitle,
        mode: 'insensitive',
      },
      mb_recording_id: {
        not: null,
      },
    },
    include: {
      recording_artist: {
        include: {
          artist: true,
        },
      },
    },
  });

  if (!recording || !recording.mb_recording_id) {
    return null;
  }

  // Extract artist MBIDs
  const mb_artist_ids = recording.recording_artist
    .map((ra) => ra.artist.mbid)
    .filter((mbid): mbid is string => mbid !== null);

  return {
    mb_recording_id: recording.mb_recording_id,
    mb_artist_ids,
    title: recording.title,
    artists: recording.recording_artist.map((ra) => ra.artist.name),
    duration_ms: recording.duration_ms,
  };
}

/**
 * Cache resolved MBIDs in database
 */
async function cacheResult(result: MBIDResolutionResult): Promise<void> {
  // Update or create recording
  await prisma.recording.upsert({
    where: {
      mb_recording_id: result.mb_recording_id,
    },
    update: {
      mb_recording_id: result.mb_recording_id,
      title: result.title,
      duration_ms: result.duration_ms,
    },
    create: {
      mb_recording_id: result.mb_recording_id,
      title: result.title,
      duration_ms: result.duration_ms,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  // Cache artist MBIDs
  for (let i = 0; i < result.mb_artist_ids.length && i < result.artists.length; i++) {
    const mbid = result.mb_artist_ids[i];
    const artistName = result.artists[i];

    if (mbid) {
      await prisma.artist.upsert({
        where: {
          mbid,
        },
        update: {
          name: artistName,
        },
        create: {
          mbid,
          name: artistName,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  }
}

/**
 * Resolve MBIDs for a recording
 *
 * Cache-first approach:
 * 1. Check database cache
 * 2. Query MusicBrainz API if not cached
 * 3. Apply duration-based matching (±2s tolerance)
 * 4. Cache results in database
 */
export async function resolveRecordingMBID(
  input: MBIDResolutionInput
): Promise<MBIDResolutionResult | null> {
  // Step 1: Check cache
  const cached = await checkCache(input.title, input.artists);
  if (cached) {
    return cached;
  }

  // Step 2: Query MusicBrainz
  const primaryArtist = input.artists[0];
  if (!primaryArtist) {
    return null;
  }

  let searchResult: MBRecordingSearchResponse;
  try {
    searchResult = await searchMusicBrainzRecordings(input.title, primaryArtist);
  } catch (error) {
    console.error('[MusicBrainz] Search failed:', error);
    return null;
  }

  // Step 3: Find best match
  const bestMatch = findBestMatch(searchResult.recordings, input.duration_ms);
  if (!bestMatch) {
    return null;
  }

  // Extract artist MBIDs from credits
  const mb_artist_ids = (bestMatch['artist-credit'] || [])
    .map((credit) => credit.artist?.id)
    .filter((id): id is string => id !== undefined);

  const result: MBIDResolutionResult = {
    mb_recording_id: bestMatch.id,
    mb_artist_ids,
    title: bestMatch.title,
    artists: (bestMatch['artist-credit'] || []).map((credit) => credit.name),
    duration_ms: bestMatch.length || null,
  };

  // Step 4: Cache result
  try {
    await cacheResult(result);
  } catch (error) {
    console.error('[MusicBrainz] Cache write failed:', error);
    // Continue even if cache fails
  }

  return result;
}
