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
  await prisma.$disconnect();
});

test('runSeed populates deterministic baseline catalog data', async () => {
  const user = await prisma.user.findUnique({
    where: { email: 'demo@playlist-manager.local' },
  });
  expect(user).toBeNull();

  await runSeed(prisma);

  const seededUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'demo@playlist-manager.local' },
  });
  expect(seededUser.id).toBeGreaterThan(0);

  const artists = await prisma.artist.findMany({
    orderBy: { mbid: 'asc' },
  });
  expect(artists.map((a) => a.name)).toEqual([
    'Boards of Canada',
    'Aphex Twin',
  ]);

  const albumTitles = await prisma.album.findMany({
    include: { primary_artist: true },
    orderBy: { title: 'asc' },
  });
  expect(
    albumTitles.map((album) => ({
      title: album.title,
      artist: album.primary_artist?.name,
    })),
  ).toEqual([
    { title: 'Music Has the Right to Children', artist: 'Boards of Canada' },
    { title: 'Selected Ambient Works 85-92', artist: 'Aphex Twin' },
  ]);

  const recordings = await prisma.recording.findMany({
    orderBy: { mb_recording_id: 'asc' },
  });
  expect(recordings.length).toBe(6);

  const playlistFirstRun = await prisma.playlist.findFirstOrThrow({
    where: { name: 'Seed Playlist', user_id: seededUser.id },
    include: {
      items: {
        orderBy: { position: 'asc' },
      },
    },
  });
  expect(playlistFirstRun.items.length).toBe(6);
  expect(playlistFirstRun.items.map((item) => item.position)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(playlistFirstRun.items.map((item) => item.mb_recording_id)).toEqual([
    '91c9ad8e-2ddb-4a3c-b061-7e86b0d6a79f',
    '4f6de5b4-11c0-4163-92d0-8e4a04c1c3aa',
    '0a2ab4c1-2d9b-4ff4-9d8f-1f1e1c1f4db2',
    'f0b8f033-0a23-4d51-9f9a-2ba1d210b040',
    'c0f01856-6b54-4c45-8729-3a4bc1d4a837',
    'c8a4d5fb-6ad6-4f34-9a1d-99793926ab41',
  ]);
  const playlistItemIds = playlistFirstRun.items.map((item) => item.id);

  await runSeed(prisma);

  const playlistSecondRun = await prisma.playlist.findFirstOrThrow({
    where: { id: playlistFirstRun.id },
    include: {
      items: {
        orderBy: { position: 'asc' },
      },
    },
  });

  expect(playlistSecondRun.items.map((item) => item.id)).toEqual(playlistItemIds);
  expect(playlistSecondRun.items.length).toBe(6);
});
