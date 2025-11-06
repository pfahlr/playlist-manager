#!/usr/bin/env tsx
import { exit } from 'node:process';

import { prisma } from '../packages/db/src/client';
import {
  createKeystore,
  rotateProviderAccountTokens,
  type ProviderTokenRecord,
} from '../packages/db/src/encryption';

interface CliOptions {
  dryRun: boolean;
}

const parseOptions = (): CliOptions => ({
  dryRun: process.argv.includes('--dry-run'),
});

async function fetchAccountTokens(): Promise<ProviderTokenRecord[]> {
  const rows = await prisma.account.findMany({
    select: {
      id: true,
      access_token_ciphertext: true,
      refresh_token_ciphertext: true,
    },
  });

  return rows.map((row) => ({
    accountId: row.id,
    access_token_ciphertext: row.access_token_ciphertext,
    refresh_token_ciphertext: row.refresh_token_ciphertext,
  }));
}

async function persistUpdates(
  records: ProviderTokenRecord[],
  updatedIds: number[],
  dryRun: boolean,
): Promise<void> {
  if (updatedIds.length === 0) {
    return;
  }

  const updating = new Set(updatedIds);

  for (const record of records) {
    if (!updating.has(record.accountId)) {
      continue;
    }

    if (dryRun) {
      continue;
    }

    await prisma.account.update({
      where: { id: record.accountId },
      data: {
        access_token_ciphertext: record.access_token_ciphertext,
        refresh_token_ciphertext: record.refresh_token_ciphertext,
      },
    });
  }
}

async function main() {
  const options = parseOptions();
  const previousKey = process.env.MASTER_KEY_PREVIOUS;
  const nextKey = process.env.MASTER_KEY;

  if (!previousKey || !nextKey) {
    console.error(
      '[rotate-token-key] Both MASTER_KEY_PREVIOUS and MASTER_KEY env vars must be set',
    );
    exit(1);
  }

  const source = createKeystore({ masterKey: previousKey });
  const target = createKeystore({ masterKey: nextKey });

  const records = await fetchAccountTokens();
  const { records: rotated, updatedIds } = rotateProviderAccountTokens(
    records,
    source,
    target,
  );

  await persistUpdates(rotated, updatedIds, options.dryRun);

  const action = options.dryRun ? 'would update' : 'updated';
  console.log(
    `[rotate-token-key] scanned ${records.length} accounts; ${action} ${updatedIds.length} tokens`,
  );
}

main()
  .catch((err) => {
    console.error('[rotate-token-key] failed', err);
    exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
