import { FastifyReply, FastifyRequest } from 'fastify';
import { getJob } from '../_mockData';
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
    throw problem({ status: 400, code: 'invalid_job_id', message: 'Invalid job id' });
  }

  const job = getJob(id);
  return reply.send(job);
}
