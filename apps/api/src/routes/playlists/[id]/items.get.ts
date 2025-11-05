import { FastifyReply, FastifyRequest } from 'fastify';
import { getPlaylistItems } from '../../_mockData';
import { problem } from '../../../lib/problem';

type Params = {
  id: string;
};

type Query = {
  effective?: boolean;
  limit?: number;
  cursor?: string;
  order?: 'position' | 'added_at';
};

export default async function handler(
  request: FastifyRequest<{ Params: Params; Querystring: Query }>,
  reply: FastifyReply,
) {
  const id = Number.parseInt(request.params.id, 10);
  if (Number.isNaN(id)) {
    throw problem({ status: 400, code: 'invalid_playlist_id', message: 'Invalid playlist id' });
  }

  const payload = getPlaylistItems(id);
  reply.header('ETag', payload.etag);
  return reply.send({ data: payload.items, next_cursor: null });
}
