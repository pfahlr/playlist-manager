import { prisma } from '../../../../../packages/db/src/client';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

let userId: number;

beforeAll(async () => {
  await prisma.$connect();
  const user = await prisma.user.create({ data: {} });
  userId = user.id;
});

afterEach(async () => {
  await prisma.playlistItem.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.playlist.deleteMany();
});

afterAll(async () => {
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

test('partial unique ISRC', async () => {
  await prisma.recording.create({ data: { title: 'A', isrc: 'XYZ' } });
  await expect(
    prisma.recording.create({ data: { title: 'B', isrc: 'XYZ' } }),
  ).rejects.toThrow();
});

test('updated_at touch', async () => {
  const p = await prisma.playlist.create({ data: { user_id: userId, name: 't' } });
  const first = p.updated_at;
  const u = await prisma.playlist.update({ where: { id: p.id }, data: { name: 'u' } });
  expect(u.updated_at.getTime()).toBeGreaterThan(first.getTime());
});

test('playlist item view falls back to snapshot fields', async () => {
  const playlist = await prisma.playlist.create({ data: { user_id: userId, name: 'snap' } });
  const item = await prisma.playlistItem.create({
    data: {
      playlist_id: playlist.id,
      snapshot_title: 'Ghost Track',
      snapshot_artists: 'Unknown Artist',
      snapshot_album: 'Mystery Album',
      duration_ms: 1234,
    },
  });

  const rows = await prisma.$queryRaw<
    Array<{ id: number; title: string | null; artists: string | null; album: string | null; duration_ms: number | null }>
  >`SELECT id, title, artists, album, duration_ms FROM v_playlist_item_effective WHERE id = ${item.id}`;

  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row.title).toBe('Ghost Track');
  expect(row.artists).toBe('Unknown Artist');
  expect(row.album).toBe('Mystery Album');
  expect(row.duration_ms).toBe(1234);
});
