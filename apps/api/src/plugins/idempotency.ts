import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';

import { normalizeIdempotencyKey } from '../lib/idempotency';

export default fp(async (app) => {
  app.decorateRequest(
    'getIdempotencyKey',
    function thisGetIdempotencyKey(this: FastifyRequest): string | null {
      const raw = this.headers?.['idempotency-key'] as string | string[] | undefined;
      return normalizeIdempotencyKey(raw);
    },
  );
});

declare module 'fastify' {
  interface FastifyRequest {
    getIdempotencyKey(): string | null;
  }
}
