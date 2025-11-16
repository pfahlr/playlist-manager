import { FastifyReply, FastifyRequest } from 'fastify';
import { enqueue } from '../../lib/jobs/enqueue';
import {
  fingerprintRequest,
  resolveRequestIdempotencyKey,
  reuseJobIdIfPresent,
  storeJobForKey,
} from '../../lib/idempotency';
import { validateRequestBody } from '../../lib/openapi/validator';

type Body = {
  playlist_id: number;
  format: 'm3u' | 'xspf' | 'csv';
  variant?: 'lean' | 'verbose';
};

export default async function handler(
  request: FastifyRequest<{ Body: Body }>,
  reply: FastifyReply,
) {
  const rawContentType = request.headers['content-type'];
  const contentType = Array.isArray(rawContentType)
    ? rawContentType[0]
    : typeof rawContentType === 'string'
      ? rawContentType
      : undefined;

  await validateRequestBody({
    method: 'POST',
    path: '/exports/file',
    body: request.body,
    contentType,
    errorCode: 'invalid_export_request',
    errorMessage: 'Invalid export request',
  });

  const payload = request.body;
  const fingerprint = fingerprintRequest({ method: 'POST', path: '/exports/file', body: payload });
  const idempotencyKey = resolveRequestIdempotencyKey(request);
  const existingJobId = reuseJobIdIfPresent(idempotencyKey, fingerprint);
  if (existingJobId !== null) {
    return reply.status(202).send({ job_id: existingJobId, status: 'queued' });
  }

  const job = await enqueue({
    kind: 'export_file',
    playlist_id: payload.playlist_id,
    format: payload.format,
    variant: payload.variant ?? 'lean',
  });

  storeJobForKey(idempotencyKey, fingerprint, job.id);
  return reply.status(202).send({ job_id: job.id, status: 'queued' });
}
