import { FastifyReply, FastifyRequest } from 'fastify';
import { enqueueJob } from '../_mockData';
import { problem } from '../../lib/problem';

type Body = {
  source_provider: 'spotify' | 'deezer' | 'tidal' | 'youtube';
  source_playlist_id: number;
  dest_provider: 'spotify' | 'deezer' | 'tidal' | 'youtube';
  dest_playlist_name?: string;
};

function isValidPayload(body: Body | undefined): body is Body {
  if (!body) return false;
  const providers = new Set(['spotify', 'deezer', 'tidal', 'youtube']);
  return (
    providers.has(body.source_provider) &&
    providers.has(body.dest_provider) &&
    typeof body.source_playlist_id === 'number' &&
    Number.isFinite(body.source_playlist_id)
  );
}

export default async function handler(
  request: FastifyRequest<{ Body: Body }>,
  reply: FastifyReply,
) {
  if (!isValidPayload(request.body)) {
    throw problem({ status: 400, code: 'invalid_migration_request', message: 'Invalid migration request' });
  }

  const body = request.body;
  request.requireProvider(body.source_provider);
  request.requireProvider(body.dest_provider);

  const { jobRef } = enqueueJob('migrate');
  return reply.status(202).send(jobRef);
}
