import { expect, test } from 'vitest';
import { upsertWikiBio } from '../../../../apps/worker/src/enrichment/wikipedia';

test('stores summary and link', async () => {
  const res = await upsertWikiBio(
    { mbid: 'uuid-artist', name: 'Example Artist' },
    {
      summary: 'Example summary',
      url: 'https://en.wikipedia.org/wiki/Example_Artist',
    }
  );
  expect(res.ok).toBe(true);
});
