import { afterAll, beforeEach, describe, expect, test } from 'vitest';

import { prisma } from '../../../../../packages/db/src/client';
import { runGcOnce } from '../../../../../apps/worker/src/jobs/snapshotGc';

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

describe('snapshot GC job', () => {
  test('clears snapshot fields when a normalized recording is matched', async () => {
    const { playlist } = await createUserAndPlaylist();

    const recording = await prisma.recording.create({
      data: {
        title: 'Normalized Track',
      },
    });

    const item = await prisma.playlistItem.create({
      data: {
        playlist_id: playlist.id,
        position: 0,
        recording_id: recording.id,
        snapshot_title: 'Legacy Title',
        snapshot_artists: 'Legacy Artist',
        snapshot_album: 'Legacy Album',
        snapshot_expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await runGcOnce();

    const updated = await prisma.playlistItem.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(updated.snapshot_title).toBeNull();
    expect(updated.snapshot_artists).toBeNull();
    expect(updated.snapshot_album).toBeNull();
    expect(updated.snapshot_expires_at).toBeNull();
  });

  test('clears expired snapshot fields when TTL elapses', async () => {
    const { playlist } = await createUserAndPlaylist();

    const expiredItem = await prisma.playlistItem.create({
      data: {
        playlist_id: playlist.id,
        position: 0,
        snapshot_title: 'Expired Title',
        snapshot_artists: 'Expired Artist',
        snapshot_album: 'Expired Album',
        snapshot_expires_at: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await runGcOnce();

    const updated = await prisma.playlistItem.findUniqueOrThrow({
      where: { id: expiredItem.id },
    });

    expect(updated.snapshot_title).toBeNull();
    expect(updated.snapshot_artists).toBeNull();
    expect(updated.snapshot_album).toBeNull();
    expect(updated.snapshot_expires_at).toBeNull();
  });

  test('keeps snapshot fields when neither condition matches', async () => {
    const { playlist } = await createUserAndPlaylist();

    const activeItem = await prisma.playlistItem.create({
      data: {
        playlist_id: playlist.id,
        position: 0,
        snapshot_title: 'Active Title',
        snapshot_artists: 'Active Artist',
        snapshot_album: 'Active Album',
        snapshot_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await runGcOnce();

    const updated = await prisma.playlistItem.findUniqueOrThrow({
      where: { id: activeItem.id },
    });

    expect(updated.snapshot_title).toBe('Active Title');
    expect(updated.snapshot_artists).toBe('Active Artist');
    expect(updated.snapshot_album).toBe('Active Album');
    expect(updated.snapshot_expires_at).not.toBeNull();
  });
});

async function createUserAndPlaylist() {
  const user = await prisma.user.create({
    data: {
      email: `worker-gc+${Math.random().toString(16).slice(2)}@local`,
    },
  });

  const playlist = await prisma.playlist.create({
    data: {
      user_id: user.id,
      name: 'Test Playlist',
    },
  });

  return { user, playlist };
}
