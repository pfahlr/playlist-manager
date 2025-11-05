import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultPrisma = new PrismaClient();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const seedDataDir = path.join(currentDir, 'seed-data');

function readJSON<T>(fileName: string): T {
  const fullPath = path.join(seedDataDir, fileName);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as T;
}

async function upsertUserByEmail(client: PrismaClient, email: string) {
  return client.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
}

type SeedContext = {
  prisma: PrismaClient;
};

async function seedArtists({ prisma }: SeedContext) {
  type ArtistRow = { name: string; mbid: string };
  const artists = readJSON<ArtistRow[]>('artists.json');

  for (const artist of artists) {
    await prisma.artist.upsert({
      where: { mbid: artist.mbid },
      update: { name: artist.name },
      create: { name: artist.name, mbid: artist.mbid },
    });
  }
}

async function seedAlbums({ prisma }: SeedContext) {
  type AlbumRow = { title: string; artistMbid: string };
  const albums = readJSON<AlbumRow[]>('albums.json');

  for (const album of albums) {
    const artist = await prisma.artist.findUniqueOrThrow({ where: { mbid: album.artistMbid } });

    const existing = await prisma.album.findFirst({
      where: { title: album.title, primary_artist_id: artist.id },
    });

    if (existing) {
      if (!existing.primary_artist_id) {
        await prisma.album.update({
          where: { id: existing.id },
          data: { primary_artist_id: artist.id },
        });
      }
    } else {
      await prisma.album.create({
        data: {
          title: album.title,
          primary_artist: { connect: { id: artist.id } },
        },
      });
    }
  }
}

async function seedRecordings({ prisma }: SeedContext) {
  type RecordingRow = {
    title: string;
    durationMs: number;
    mbid: string;
    artistMbid: string;
    albumTitle: string;
  };

  const recordings = readJSON<RecordingRow[]>('recordings.json');

  for (const row of recordings) {
    const artist = await prisma.artist.findUniqueOrThrow({ where: { mbid: row.artistMbid } });
    const album = await prisma.album.findFirstOrThrow({
      where: { title: row.albumTitle, primary_artist_id: artist.id },
    });

    const recording = await prisma.recording.upsert({
      where: { mb_recording_id: row.mbid },
      update: {
        title: row.title,
        duration_ms: row.durationMs,
        album_id: album.id,
      },
      create: {
        title: row.title,
        duration_ms: row.durationMs,
        mb_recording_id: row.mbid,
        album_id: album.id,
      },
    });

    await prisma.recordingArtist.upsert({
      where: {
        recording_id_artist_id: {
          recording_id: recording.id,
          artist_id: artist.id,
        },
      },
      update: {
        role: 'primary',
        ordinal: 0,
      },
      create: {
        recording_id: recording.id,
        artist_id: artist.id,
        role: 'primary',
        ordinal: 0,
      },
    });
  }
}

async function seedPlaylist({ prisma }: SeedContext, userId: number) {
  const playlistTitle = 'Seed Playlist';

  const playlistExisting = await prisma.playlist.findFirst({
    where: { user_id: userId, name: playlistTitle },
  });

  const playlist =
    playlistExisting ??
    (await prisma.playlist.create({
      data: {
        user_id: userId,
        name: playlistTitle,
        description: 'Deterministic seed',
      },
    }));

  const recordings = await prisma.recording.findMany({
    orderBy: { id: 'asc' },
    take: 6,
    include: { album: true },
  });

  let position = 0;
  for (const recording of recordings) {
    const existing = await prisma.playlistItem.findFirst({
      where: { playlist_id: playlist.id, recording_id: recording.id },
    });

    if (!existing) {
      await prisma.playlistItem.create({
        data: {
          playlist_id: playlist.id,
          recording_id: recording.id,
          position: position++,
          duration_ms: recording.duration_ms,
          isrc: recording.isrc,
          mb_recording_id: recording.mb_recording_id,
          mb_release_id: recording.album?.mb_release_id,
        },
      });
    }
  }
}

export async function runSeed(prisma: PrismaClient = defaultPrisma) {
  // ---- 0) Deterministic user
  const user = await upsertUserByEmail(prisma, 'demo@playlist-manager.local');

  await seedArtists({ prisma });
  await seedAlbums({ prisma });
  await seedRecordings({ prisma });
  await seedPlaylist({ prisma }, user.id);

  console.log('✅ Seed complete:', {
    user: user.email,
  });
}

const executedDirectly =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (executedDirectly) {
  runSeed()
    .then(() => defaultPrisma.$disconnect())
    .catch((error) => {
      console.error(error);
      return defaultPrisma
        .$disconnect()
        .finally(() => process.exit(1));
    });
}
