import { FastifyReply, FastifyRequest } from 'fastify';
import { getJob } from '../_mockData';

type Params = {
  id: string;
};

export default async function handler(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const id = Number.parseInt(request.params.id, 10);
  if (Number.isNaN(id)) {
    return reply.status(400).send({ error: 'bad_request', message: 'Invalid job id' });
  }

  const job = getJob(id);
  return reply.send(job);
}
