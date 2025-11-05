import { FastifyReply, FastifyRequest } from 'fastify';
import { setActivePlaylist } from '../_mockData';
import { problem } from '../../lib/problem';

type Body = {
  playlist_id: number;
};

export default async function handler(
  request: FastifyRequest<{ Body: Body }>,
  reply: FastifyReply,
) {
  const { playlist_id } = request.body ?? {};
  const isNumber = typeof playlist_id === 'number' && Number.isFinite(playlist_id);

  if (!isNumber) {
    throw problem({ status: 400, code: 'invalid_playlist_id', message: 'playlist_id must be an integer' });
  }

  setActivePlaylist(playlist_id);
  return reply.status(204).send();
}
