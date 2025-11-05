import { FastifyReply, FastifyRequest } from 'fastify';
import { getPlaylist } from '../_mockData';
import { problem } from '../../lib/problem';

type Params = {
  id: string;
};

export default async function handler(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const id = Number.parseInt(request.params.id, 10);
  if (Number.isNaN(id)) {
    throw problem({ status: 400, code: 'invalid_playlist_id', message: 'Invalid playlist id' });
  }

  const playlist = getPlaylist(id);
  return reply.send(playlist);
}
