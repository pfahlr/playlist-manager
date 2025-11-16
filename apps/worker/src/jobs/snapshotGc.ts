import { prisma } from '@app/db';

// Mirror of ADR-004 snapshot cleanup query.
const SNAPSHOT_GC_SQL = `
  UPDATE playlist_item
  SET
    snapshot_title = NULL,
    snapshot_artists = NULL,
    snapshot_album = NULL,
    snapshot_expires_at = NULL
  WHERE
    (snapshot_title IS NOT NULL OR snapshot_artists IS NOT NULL OR snapshot_album IS NOT NULL OR snapshot_expires_at IS NOT NULL)
    AND (
      recording_id IS NOT NULL
      OR (snapshot_expires_at IS NOT NULL AND snapshot_expires_at <= now())
    );
`;

export async function runGcOnce(): Promise<number> {
  const cleared = await prisma.$executeRawUnsafe(SNAPSHOT_GC_SQL);
  return typeof cleared === 'number' ? cleared : 0;
}

export const snapshotGcJobName = 'snapshot-gc';
