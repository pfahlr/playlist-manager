import { prisma } from '../../../../../packages/db/src/client';
import { beforeAll, afterAll, afterEach, expect, test } from 'vitest';

let userId: number;

beforeAll(async () => {
  await prisma.$connect();
  const user = await prisma.user.create({ data: {} });
  userId = user.id;
});

afterEach(async () => {
  await prisma.playlist.deleteMany();
});

afterAll(async () => {
  await prisma.activePlaylist.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

test('can create/read playlist', async () => {
  const p = await prisma.playlist.create({ data: { user_id: userId, name: 'Smoke' } });
  const r = await prisma.playlist.findUnique({ where: { id: p.id } });
  expect(r?.name).toBe('Smoke');
});
