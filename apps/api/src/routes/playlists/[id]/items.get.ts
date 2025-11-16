import { FastifyReply, FastifyRequest } from 'fastify';

import { fetchEffectivePlaylistItems, type FetchEffectiveItemsArgs } from '../../../lib/db/effectiveItems';
import { problem } from '../../../lib/problem';

type Params = {
  id: string;
};

type Query = {
  effective?: boolean | string;
  limit?: number | string;
  cursor?: string;
  order?: string;
};

export default async function handler(
  request: FastifyRequest<{ Params: Params; Querystring: Query }>,
  reply: FastifyReply,
) {
  const playlistId = parsePlaylistId(request.params.id);
  const order = parseOrder(request.query?.order);
  const limit = parseLimit(request.query?.limit);
  const cursor = parseCursor(request.query?.cursor);
  const effective = parseEffective(request.query?.effective);
  if (!effective) {
    throw problem({
      status: 422,
      code: 'effective_mode_required',
      message: 'Only effective playlist items are supported',
    });
  }

  const result = await fetchEffectivePlaylistItems({
    playlistId,
    limit,
    cursor,
    order,
  });

  reply.header('ETag', result.etag);
  return reply.send({ data: result.items, next_cursor: result.nextCursor });
}

type OrderMode = FetchEffectiveItemsArgs['order'];

function parsePlaylistId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw problem({ status: 400, code: 'invalid_playlist_id', message: 'Invalid playlist id' });
  }
  return id;
}

function parseLimit(value: Query['limit']): number {
  if (value === undefined || value === null) {
    return 100;
  }
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) {
    return 100;
  }
  return Math.min(500, Math.max(1, numeric));
}

function parseCursor(value: Query['cursor']): number | null {
  if (!value) {
    return null;
  }
  const numeric = Number.parseInt(value, 10);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw problem({ status: 400, code: 'invalid_cursor', message: 'Cursor must be a numeric id' });
  }
  return numeric;
}

function parseOrder(value: Query['order']): OrderMode {
  if (!value || value === 'position') {
    return 'position';
  }
  if (value === 'added_at') {
    return 'added_at';
  }
  throw problem({
    status: 422,
    code: 'invalid_order',
    message: 'order must be either position or added_at',
  });
}

function parseEffective(value: Query['effective']): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw problem({
    status: 422,
    code: 'invalid_effective',
    message: 'effective must be a boolean value',
  });
}
