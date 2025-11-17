import { expect, test, beforeEach, describe } from 'vitest';
import { upsertWikiBio } from '../wikipedia';
import { prisma } from '@app/db';

describe('Wikipedia enrichment', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.artistLink.deleteMany({});
    await prisma.artistBio.deleteMany({});
    await prisma.artist.deleteMany({});
  });

  test('stores summary and link', async () => {
    const res = await upsertWikiBio(
      { mbid: 'uuid-artist-1234', name: 'Example Artist' },
      {
        summary: 'Example summary about the artist.',
        url: 'https://en.wikipedia.org/wiki/Example_Artist',
      }
    );

    expect(res.ok).toBe(true);
    expect(res.bioId).toBeDefined();
    expect(res.linkId).toBeDefined();

    // Verify bio was stored
    const bio = await prisma.artistBio.findUnique({
      where: { id: res.bioId },
    });
    expect(bio).toBeTruthy();
    expect(bio?.summary).toBe('Example summary about the artist.');
    expect(bio?.source).toBe('wikipedia');

    // Verify link was stored
    const link = await prisma.artistLink.findUnique({
      where: { id: res.linkId },
    });
    expect(link).toBeTruthy();
    expect(link?.url).toBe('https://en.wikipedia.org/wiki/Example_Artist');
    expect(link?.kind).toBe('wikipedia');
  });

  test('creates artist if not exists', async () => {
    const artistsBefore = await prisma.artist.count();

    const res = await upsertWikiBio(
      { mbid: 'new-artist-uuid', name: 'New Artist' },
      {
        summary: 'Bio for new artist.',
        url: 'https://en.wikipedia.org/wiki/New_Artist',
      }
    );

    expect(res.ok).toBe(true);

    const artistsAfter = await prisma.artist.count();
    expect(artistsAfter).toBe(artistsBefore + 1);

    // Verify artist was created with correct MBID
    const artist = await prisma.artist.findUnique({
      where: { mbid: 'new-artist-uuid' },
    });
    expect(artist).toBeTruthy();
    expect(artist?.name).toBe('New Artist');
  });

  test('updates existing bio on subsequent calls', async () => {
    // First call
    const firstRes = await upsertWikiBio(
      { mbid: 'update-test-uuid', name: 'Update Test Artist' },
      {
        summary: 'Original summary.',
        url: 'https://en.wikipedia.org/wiki/Update_Test',
      }
    );

    expect(firstRes.ok).toBe(true);

    // Second call with updated data
    const secondRes = await upsertWikiBio(
      { mbid: 'update-test-uuid', name: 'Update Test Artist' },
      {
        summary: 'Updated summary with more information.',
        url: 'https://en.wikipedia.org/wiki/Update_Test',
      }
    );

    expect(secondRes.ok).toBe(true);
    expect(secondRes.bioId).toBe(firstRes.bioId); // Same bio record

    // Verify bio was updated
    const bio = await prisma.artistBio.findUnique({
      where: { id: secondRes.bioId },
    });
    expect(bio?.summary).toBe('Updated summary with more information.');
  });

  test('handles multiple links for same artist', async () => {
    // Add Wikipedia link
    const wikiRes = await upsertWikiBio(
      { mbid: 'multi-link-uuid', name: 'Multi Link Artist' },
      {
        summary: 'Artist with multiple links.',
        url: 'https://en.wikipedia.org/wiki/Multi_Link_Artist',
      }
    );

    expect(wikiRes.ok).toBe(true);

    // Manually add another link (e.g., from a different source)
    const artist = await prisma.artist.findUnique({
      where: { mbid: 'multi-link-uuid' },
    });

    await prisma.artistLink.create({
      data: {
        artist_id: artist!.id,
        kind: 'official_website',
        url: 'https://example.com',
        source: 'manual',
        updated_at: new Date(),
      },
    });

    // Verify both links exist
    const links = await prisma.artistLink.findMany({
      where: { artist_id: artist!.id },
    });

    expect(links).toHaveLength(2);
    expect(links.some((l) => l.kind === 'wikipedia')).toBe(true);
    expect(links.some((l) => l.kind === 'official_website')).toBe(true);
  });

  test('uses provided artistId if available', async () => {
    // Pre-create artist
    const artist = await prisma.artist.create({
      data: {
        mbid: 'existing-artist-uuid',
        name: 'Existing Artist',
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    // Provide artistId directly
    const res = await upsertWikiBio(
      {
        mbid: 'existing-artist-uuid',
        name: 'Existing Artist',
        artistId: artist.id,
      },
      {
        summary: 'Bio for existing artist.',
        url: 'https://en.wikipedia.org/wiki/Existing_Artist',
      }
    );

    expect(res.ok).toBe(true);

    // Verify bio is linked to correct artist
    const bio = await prisma.artistBio.findUnique({
      where: { id: res.bioId },
      include: { artist: true },
    });

    expect(bio?.artist.id).toBe(artist.id);
    expect(bio?.artist.mbid).toBe('existing-artist-uuid');
  });

  test('handles unique constraint on bio source', async () => {
    // First upsert
    const firstRes = await upsertWikiBio(
      { mbid: 'constraint-test-uuid', name: 'Constraint Test' },
      {
        summary: 'First bio.',
        url: 'https://en.wikipedia.org/wiki/First',
      }
    );

    expect(firstRes.ok).toBe(true);

    // Second upsert with same source - should update, not create duplicate
    const secondRes = await upsertWikiBio(
      { mbid: 'constraint-test-uuid', name: 'Constraint Test' },
      {
        summary: 'Second bio.',
        url: 'https://en.wikipedia.org/wiki/Second',
      }
    );

    expect(secondRes.ok).toBe(true);

    // Verify only one bio exists for this artist
    const artist = await prisma.artist.findUnique({
      where: { mbid: 'constraint-test-uuid' },
    });

    const bios = await prisma.artistBio.findMany({
      where: {
        artist_id: artist!.id,
        source: 'wikipedia',
      },
    });

    expect(bios).toHaveLength(1);
    expect(bios[0].summary).toBe('Second bio.');
  });
});
