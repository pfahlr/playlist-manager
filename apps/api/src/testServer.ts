// apps/api/src/testServer.ts
import fastify, { FastifyInstance } from 'fastify';
import type { Server } from 'http';
import { problem } from './lib/problem.js';
import errorsPlugin from './plugins/errors.js';
import featureGuard from './plugins/feature-guard.js';
import { registerMiddleware } from './middleware.js';
import authProviders from './routes/auth.providers.js';
import { registerRouteHandlers } from './routes/register-handlers.js';
import jobEvents from './routes/jobs.events.js';

/**
 * Create a Fastify server for tests.
 * If a route module is missing, it is silently skipped (lets you test one route at a time).
 * Wire your OpenAPI response validator inside this function once available.
 */
export async function makeServer(): Promise<Server> {
  const app: FastifyInstance = fastify({
    logger: false, // enable per-test if you need debugging
  });

  // JSON parsing is built-in; add other plugins here if needed.

  app.addHook('preHandler', async (request, reply) => {
    const auth = request.headers['authorization'];
    const expected = 'Bearer test-token';
    if (!auth || typeof auth !== 'string' || auth !== expected) {
      throw problem({ status: 401, code: 'unauthorized', message: 'Invalid or missing Authorization header' });
    }
  });

  await app.register(errorsPlugin);
  await app.register(featureGuard);
  await registerMiddleware(app);

  await app.register(authProviders);
  await app.register(jobEvents);
  await registerRouteHandlers(app);

  await app.ready();
  return app.server;
}
