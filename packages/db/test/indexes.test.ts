import { afterAll, describe, expect, test } from 'vitest';
import { prisma } from '../src/client';

async function fetchIndexMap(table: string) {
  const rows = await prisma.$queryRaw<
    Array<{ indexname: string; indexdef: string }>
  >`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}`;
  return new Map(rows.map((row) => [row.indexname, row.indexdef]));
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('hot-path indexes', () => {
  test('playlist lookups use user scope index', async () => {
    const indexes = await fetchIndexMap('playlist');
    expect(indexes.has('playlist_user_scope_idx')).toBe(true);
  });

  test('playlist items join on recording id without sequential scan', async () => {
    const indexes = await fetchIndexMap('playlist_item');
    expect(indexes.has('playlist_item_recording_id_idx')).toBe(true);
  });

  test('artist follows resolve by artist efficiently', async () => {
    const indexes = await fetchIndexMap('artist_follow');
    expect(indexes.has('artist_follow_artist_id_idx')).toBe(true);
  });
});

describe('fuzzy search support', () => {
  test('pg_trgm extension is installed', async () => {
    const [{ exists }] = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')`;
    expect(exists).toBe(true);
  });

  test('artist and recording trigram indexes are present', async () => {
    const artistIndexes = await fetchIndexMap('artist');
    const recordingIndexes = await fetchIndexMap('recording');

    expect(artistIndexes.get('artist_name_trgm_idx')).toMatch(/USING gin/i);
    expect(recordingIndexes.get('recording_title_trgm_idx')).toMatch(
      /USING gin/i,
    );
  });
});
