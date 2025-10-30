import { FastifyReply, FastifyRequest } from 'fastify';
import { removePlaylistItem } from '../../_mockData';

type Params = {
  itemId: string;
};

export default async function handler(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const itemId = Number.parseInt(request.params.itemId, 10);
  if (Number.isNaN(itemId)) {
    return reply.status(400).send({ error: 'bad_request', message: 'Invalid item id' });
  }

  removePlaylistItem(itemId);
  return reply.status(204).send();
}
