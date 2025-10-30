import { FastifyReply, FastifyRequest } from 'fastify';
import { setActivePlaylist } from '../_mockData';

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
    return reply.status(400).send({ error: 'bad_request', message: 'playlist_id must be an integer' });
  }

  setActivePlaylist(playlist_id);
  return reply.status(204).send();
}
