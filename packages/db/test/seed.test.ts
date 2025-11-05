import { beforeEach, afterAll, expect, test } from 'vitest';
import { prisma } from '../src/client';
import { runSeed } from '../prisma/seed';

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      playlist_item,
      provider_track_map,
      provider_playlist_map,
      recording_artist,
      recording,
      album,
      artist_relation,
      artist_link,
      artist_bio,
      artist_follow,
      playlist,
      active_playlist,
      job,
      account,
      app_user
    RESTART IDENTITY CASCADE;
  `);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

test('runSeed populates baseline catalog data', async () => {
  await runSeed(prisma);

  const artist = await prisma.artist.findUnique({
    where: { mbid: 'a04d5341-d8e1-4c24-bf5b-6fbe77e38e1b' },
  });
  expect(artist).not.toBeNull();

  const album = await prisma.album.findFirst({
    where: { title: 'Music Has the Right to Children' },
    include: { primary_artist: true },
  });
  expect(album?.primary_artist?.name).toBe('Boards of Canada');

  const recording = await prisma.recording.findUnique({
    where: { mb_recording_id: '91c9ad8e-2ddb-4a3c-b061-7e86b0d6a79f' },
    include: { artists: true },
  });
  expect(recording?.artists.length).toBeGreaterThan(0);

  const playlist = await prisma.playlist.findFirst({
    where: { name: 'Seed Playlist' },
    include: { items: true },
  });
  expect(playlist?.items.length).toBeGreaterThan(0);
});
