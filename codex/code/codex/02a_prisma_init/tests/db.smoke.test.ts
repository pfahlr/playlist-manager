import { prisma } from '../../../../../packages/db/src/client';
import { beforeAll, afterAll, expect, test } from 'vitest';

let userId: number;

beforeAll(async () => {
  await prisma.$connect();
  const user = await prisma.user.create({ data: {} });
  userId = user.id;
});

afterAll(async () => {
  await prisma.playlist.deleteMany({ where: { user_id: userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

test('can create/read playlist', async () => {
  const p = await prisma.playlist.create({ data: { user_id: userId, name: 'Smoke' } });
  const r = await prisma.playlist.findUnique({ where: { id: p.id } });
  expect(r?.name).toBe('Smoke');
});
