import { Prisma, PrismaClient } from '@prisma/client';
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

type SeedClient = PrismaClient | Prisma.TransactionClient;

async function upsertUserByEmail(client: SeedClient, email: string) {
  return client.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
}

type SeedContext = {
  prisma: SeedClient;
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
  type AlbumRow = { title: string; artistMbid: string; mbReleaseId?: string | null };
  const albums = readJSON<AlbumRow[]>('albums.json');

  for (const album of albums) {
    const artist = await prisma.artist.findUniqueOrThrow({ where: { mbid: album.artistMbid } });

    const existing = await prisma.album.findFirst({
      where: { title: album.title, primary_artist_id: artist.id },
    });

    if (existing) {
      const updates: Prisma.AlbumUpdateInput = {};

      if (!existing.primary_artist_id) {
        updates.primary_artist = { connect: { id: artist.id } };
      }

      if (album.mbReleaseId && existing.mb_release_id !== album.mbReleaseId) {
        updates.mb_release_id = album.mbReleaseId;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.album.update({
          where: { id: existing.id },
          data: updates,
        });
      }
    } else {
      await prisma.album.create({
        data: {
          title: album.title,
          mb_release_id: album.mbReleaseId ?? null,
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
    isrc?: string | null;
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
        isrc: row.isrc ?? null,
      },
      create: {
        title: row.title,
        duration_ms: row.durationMs,
        mb_recording_id: row.mbid,
        album_id: album.id,
        isrc: row.isrc ?? null,
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
  type PlaylistSeed = {
    name: string;
    description?: string | null;
    items: Array<{
      recordingMbid: string;
      position: number;
    }>;
  };

  const seed = readJSON<PlaylistSeed>('playlist.json');
  const playlistName = seed.name;

  if (!playlistName) {
    throw new Error('Playlist seed requires a name');
  }

  let playlist = await prisma.playlist.findFirst({
    where: { user_id: userId, name: playlistName },
  });

  const playlistDescription = seed.description ?? null;

  if (!playlist) {
    playlist = await prisma.playlist.create({
      data: {
        user_id: userId,
        name: playlistName,
        description: playlistDescription,
      },
    });
  } else if ((playlist.description ?? null) !== playlistDescription) {
    playlist = await prisma.playlist.update({
      where: { id: playlist.id },
      data: { description: playlistDescription },
    });
  }

  if (!Array.isArray(seed.items)) {
    throw new Error('Playlist seed requires an items array');
  }

  const sortedItems = [...seed.items].sort((a, b) => a.position - b.position);

  if (sortedItems.length === 0) {
    await prisma.playlistItem.deleteMany({ where: { playlist_id: playlist.id } });
    return;
  }

  const allowedPositions = Array.from(new Set(sortedItems.map((item) => item.position)));

  await prisma.playlistItem.deleteMany({
    where: {
      playlist_id: playlist.id,
      OR: [
        { position: null },
        { position: { notIn: allowedPositions } },
      ],
    },
  });

  for (const item of sortedItems) {
    const recording = await prisma.recording.findUniqueOrThrow({
      where: { mb_recording_id: item.recordingMbid },
      include: { album: true },
    });

    await prisma.playlistItem.upsert({
      where: {
        playlist_id_position: {
          playlist_id: playlist.id,
          position: item.position,
        },
      },
      update: {
        position: item.position,
        recording_id: recording.id,
        duration_ms: recording.duration_ms,
        isrc: recording.isrc,
        mb_recording_id: recording.mb_recording_id,
        mb_release_id: recording.album?.mb_release_id ?? null,
        provider_track_id: null,
        snapshot_album: null,
        snapshot_artists: null,
        snapshot_title: null,
        snapshot_expires_at: null,
      },
      create: {
        playlist_id: playlist.id,
        position: item.position,
        recording_id: recording.id,
        duration_ms: recording.duration_ms,
        isrc: recording.isrc,
        mb_recording_id: recording.mb_recording_id,
        mb_release_id: recording.album?.mb_release_id ?? null,
      },
    });
  }
}

const SEED_USER_EMAIL = 'demo@playlist-manager.local';

export async function runSeed(prisma: PrismaClient = defaultPrisma) {
  return prisma.$transaction(async (tx) => {
    const user = await upsertUserByEmail(tx, SEED_USER_EMAIL);

    await seedArtists({ prisma: tx });
    await seedAlbums({ prisma: tx });
    await seedRecordings({ prisma: tx });
    await seedPlaylist({ prisma: tx }, user.id);

    return { userEmail: user.email };
  });
}

const executedDirectly =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

async function main() {
  try {
    const { userEmail } = await runSeed(defaultPrisma);
    console.log('✅ Seed complete:', { user: userEmail });
    await defaultPrisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed');
    console.error(error);
    await defaultPrisma.$disconnect();
    process.exit(1);
  }
}

if (executedDirectly) {
  main();
}
