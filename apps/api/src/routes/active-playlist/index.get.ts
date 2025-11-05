import { FastifyReply, FastifyRequest } from 'fastify';
import { getActivePlaylist } from '../_mockData';
import { problem } from '../../lib/problem';

export default async function handler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const payload = getActivePlaylist();
  if (payload.playlist_id === null) {
    throw problem({ status: 404, code: 'active_playlist_missing', message: 'Active playlist not set' });
  }

  return reply.send(payload);
}
