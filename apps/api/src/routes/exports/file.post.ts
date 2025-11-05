import { FastifyReply, FastifyRequest } from 'fastify';
import { enqueueJob } from '../_mockData';
import { problem } from '../../lib/problem';

type Body = {
  playlist_id: number;
  format: 'm3u' | 'xspf' | 'csv';
  variant?: 'lean' | 'verbose';
};

function isValid(body: Body | undefined): body is Body {
  if (!body) return false;
  const formats = new Set(['m3u', 'xspf', 'csv']);
  const variants = new Set(['lean', 'verbose']);
  const variantOk = body.variant ? variants.has(body.variant) : true;
  return (
    typeof body.playlist_id === 'number' &&
    Number.isFinite(body.playlist_id) &&
    formats.has(body.format) &&
    variantOk
  );
}

export default async function handler(
  request: FastifyRequest<{ Body: Body }>,
  reply: FastifyReply,
) {
  if (!isValid(request.body)) {
    throw problem({ status: 400, code: 'invalid_export_request', message: 'Invalid export request' });
  }

  const { jobRef } = enqueueJob('export');
  return reply.status(202).send(jobRef);
}
