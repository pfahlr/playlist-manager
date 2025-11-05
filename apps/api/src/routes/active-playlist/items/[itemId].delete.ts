import { FastifyReply, FastifyRequest } from 'fastify';
import { removePlaylistItem } from '../../_mockData';
import { problem } from '../../../lib/problem';

type Params = {
  itemId: string;
};

export default async function handler(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const itemId = Number.parseInt(request.params.itemId, 10);
  if (Number.isNaN(itemId)) {
    throw problem({ status: 400, code: 'invalid_item_id', message: 'Invalid item id' });
  }

  removePlaylistItem(itemId);
  return reply.status(204).send();
}
