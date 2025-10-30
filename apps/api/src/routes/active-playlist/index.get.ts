import { FastifyReply, FastifyRequest } from 'fastify';
import { getActivePlaylist } from '../_mockData';

export default async function handler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const payload = getActivePlaylist();
  if (payload.playlist_id === null) {
    return reply.status(404).send({ error: 'not_found', message: 'Active playlist not set' });
  }

  return reply.send(payload);
}
