import { FastifyReply, FastifyRequest } from 'fastify';
import { enqueue } from '../../lib/jobs/enqueue';
import { validateRequestBody } from '../../lib/openapi/validator';

type Body = {
  source_provider: 'spotify' | 'deezer' | 'tidal' | 'youtube';
  source_playlist_id: number;
  dest_provider: 'spotify' | 'deezer' | 'tidal' | 'youtube';
  dest_playlist_name?: string;
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
    path: '/jobs/migrate',
    body: request.body,
    contentType,
    errorCode: 'invalid_migration_request',
    errorMessage: 'Invalid migration request',
  });

  const payload = request.body;
  request.requireProvider(payload.source_provider);
  request.requireProvider(payload.dest_provider);

  const job = await enqueue({
    kind: 'migrate',
    source_provider: payload.source_provider,
    source_playlist_id: payload.source_playlist_id,
    dest_provider: payload.dest_provider,
    dest_playlist_name: payload.dest_playlist_name ?? null,
  });

  return reply.status(202).send({ job_id: job.id, status: 'queued' });
}
