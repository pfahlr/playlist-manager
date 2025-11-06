import type { FastifyInstance } from 'fastify';

import { createResponseValidationHook } from './lib/openapi/validator.js';

export async function registerMiddleware(app: FastifyInstance): Promise<void> {
  const responseValidationHook = await createResponseValidationHook();
  app.addHook('preSerialization', responseValidationHook);
}
