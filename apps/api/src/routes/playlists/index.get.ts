import { FastifyReply, FastifyRequest } from 'fastify';
import { listPlaylists } from '../_mockData';

type Query = {
  provider?: string;
};

export default async function handler(
  request: FastifyRequest<{ Querystring: Query }>,
  reply: FastifyReply,
) {
  const { provider } = request.query ?? {};
  const payload = listPlaylists();

  const filtered = provider
    ? payload.data.filter((playlist) => playlist.provider === provider)
    : payload.data;

  reply.send({ data: filtered, next_cursor: payload.next_cursor });
}
