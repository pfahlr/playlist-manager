import { FastifyReply, FastifyRequest } from 'fastify';
import { getPlaylistItems } from '../../_mockData';

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
    return reply.status(400).send({ error: 'bad_request', message: 'Invalid playlist id' });
  }

  const payload = getPlaylistItems(id);
  reply.header('ETag', payload.etag);
  return reply.send({ data: payload.items, next_cursor: null });
}
