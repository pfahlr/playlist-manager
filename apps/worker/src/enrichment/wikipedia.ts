/**
 * Wikipedia enrichment service
 *
 * Stores artist biographies and links from Wikipedia
 * via MusicBrainz MBID → Wikidata → Wikipedia mapping
 */

import { prisma } from '@app/db';

/**
 * Artist identification input
 */
export interface ArtistInput {
  mbid: string;
  name: string;
  artistId?: number; // Optional: provide if already resolved
}

/**
 * Wikipedia data to store
 */
export interface WikipediaData {
  summary: string;
  url: string;
}

/**
 * Result of upsert operation
 */
export interface UpsertResult {
  ok: boolean;
  bioId?: number;
  linkId?: number;
  error?: string;
}

/**
 * Upsert Wikipedia biography and link for an artist
 *
 * @param artist - Artist identification (MBID and name)
 * @param data - Wikipedia summary and URL
 * @returns Result of the upsert operation
 */
export async function upsertWikiBio(
  artist: ArtistInput,
  data: WikipediaData
): Promise<UpsertResult> {
  try {
    // Step 1: Find or create artist by MBID
    let artistId = artist.artistId;

    if (!artistId) {
      // Try to find artist by MBID
      const existingArtist = await prisma.artist.findUnique({
        where: { mbid: artist.mbid },
        select: { id: true },
      });

      if (existingArtist) {
        artistId = existingArtist.id;
      } else {
        // Create artist if not found
        const newArtist = await prisma.artist.create({
          data: {
            mbid: artist.mbid,
            name: artist.name,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
        artistId = newArtist.id;
      }
    }

    // Step 2: Upsert biography
    const bio = await prisma.artistBio.upsert({
      where: {
        artist_id_source: {
          artist_id: artistId,
          source: 'wikipedia',
        },
      },
      update: {
        summary: data.summary,
        url: data.url,
        updated_at: new Date(),
      },
      create: {
        artist_id: artistId,
        source: 'wikipedia',
        summary: data.summary,
        url: data.url,
        updated_at: new Date(),
      },
    });

    // Step 3: Upsert Wikipedia link
    const link = await prisma.artistLink.upsert({
      where: {
        artist_id_kind_url: {
          artist_id: artistId,
          kind: 'wikipedia',
          url: data.url,
        },
      },
      update: {
        source: 'wikipedia_api',
        updated_at: new Date(),
      },
      create: {
        artist_id: artistId,
        kind: 'wikipedia',
        url: data.url,
        source: 'wikipedia_api',
        confidence: 1.0, // High confidence for official Wikipedia links
        updated_at: new Date(),
      },
    });

    return {
      ok: true,
      bioId: bio.id,
      linkId: link.id,
    };
  } catch (error) {
    console.error('[Wikipedia] Failed to upsert bio/link:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch Wikipedia summary for an artist by MBID
 * (Placeholder for future integration with Wikipedia REST API)
 *
 * In production, this would:
 * 1. Query MusicBrainz for Wikidata ID from MBID
 * 2. Query Wikidata for Wikipedia article title
 * 3. Query Wikipedia REST API for summary
 */
export async function fetchWikipediaSummary(
  mbid: string
): Promise<WikipediaData | null> {
  // Placeholder - to be implemented when Wikipedia API integration is needed
  // For now, enrichment is driven by passing data directly to upsertWikiBio()
  return null;
}
