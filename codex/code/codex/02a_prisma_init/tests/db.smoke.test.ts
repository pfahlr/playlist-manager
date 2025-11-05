import { prisma } from '../../../../../packages/db/src/client';
import { beforeAll, afterAll, expect, test } from 'vitest';

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

test('can create/read playlist', async () => {
  const user = await prisma.user.create({ data: {} });
  const p = await prisma.playlist.create({ data: { user_id: user.id, name: 'Smoke' } });
  const r = await prisma.playlist.findUnique({ where: { id: p.id } });
  expect(r?.name).toBe('Smoke');
});
