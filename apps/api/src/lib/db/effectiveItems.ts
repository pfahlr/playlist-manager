import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@app/db';

const MAX_LIMIT = 500;
const MIN_LIMIT = 1;

type OrderMode = 'position' | 'added_at';

type EffectiveItemRow = {
  id: number;
  position: number | null;
  title: string;
  artists: string;
  album: string | null;
  duration_ms: number | null;
  recording_id: number | null;
  isrc: string | null;
  mb_recording_id: string | null;
  mb_release_id: string | null;
  provider_track_id: string | null;
};

export type FetchEffectiveItemsArgs = {
  playlistId: number;
  limit: number;
  cursor: number | null;
  order: OrderMode;
};

export type FetchEffectiveItemsResult = {
  items: EffectiveItemRow[];
  nextCursor: string | null;
  etag: string;
};

export async function fetchEffectivePlaylistItems(
  args: FetchEffectiveItemsArgs,
): Promise<FetchEffectiveItemsResult> {
  const limit = Math.max(MIN_LIMIT, Math.min(args.limit, MAX_LIMIT));
  const take = limit + 1;
  const cursorSql = args.cursor !== null ? Prisma.sql`AND id > ${args.cursor}` : Prisma.empty;
  const orderSql =
    args.order === 'added_at'
      ? Prisma.sql`ORDER BY id ASC`
      : Prisma.sql`ORDER BY position ASC NULLS LAST, id ASC`;

  const rows = await prisma.$queryRaw<EffectiveItemRow[]>(
    Prisma.sql`
      SELECT
        id,
        position,
        title,
        artists,
        album,
        duration_ms,
        recording_id,
        isrc,
        mb_recording_id,
        mb_release_id,
        provider_track_id
      FROM v_playlist_item_effective
      WHERE playlist_id = ${args.playlistId}
      ${cursorSql}
      ${orderSql}
      LIMIT ${take}
    `,
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1]!.id) : null;
  const etag = buildWeakEtag(args.playlistId, items);

  return { items, nextCursor, etag };
}

function buildWeakEtag(playlistId: number, items: EffectiveItemRow[]): string {
  const hash = createHash('sha1');
  hash.update(`playlist:${playlistId}:`);
  for (const item of items) {
    hash.update(`${item.id}:${item.recording_id ?? 'null'}:${item.position ?? 'null'};`);
  }
  const digest = hash.digest('base64url');
  return `W/"${digest}"`;
}

export type { EffectiveItemRow };
