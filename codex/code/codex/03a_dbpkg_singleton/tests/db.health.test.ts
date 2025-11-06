import { prisma, dbHealthcheck } from '../../../../../packages/db/src';
import { expect, test, vi } from 'vitest';

test('healthcheck ok', async () => {
  const querySpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce(undefined as never);
  const h = await dbHealthcheck();
  expect(h).toEqual({ ok: true });
  expect(prisma).toBeTruthy();
  querySpy.mockRestore();
});
