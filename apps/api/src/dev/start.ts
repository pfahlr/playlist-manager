import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import docsRoutes from '../routes/docs.js'; // ensure .ts resolves via tsx; .js is ok too
import authProviders from '../routes/auth.providers.js';
import authSessions from '../routes/auth.sessions.js';
import { registerRouteHandlers } from '../routes/register-handlers.js';
import logging from '../plugins/logging.js';
import metrics from '../plugins/metrics.js';
import featureGuard from '../plugins/feature-guard.js';
import errorsPlugin from '../plugins/errors.js';
import jobEvents from '../routes/jobs.events.js';
import importsFile from '../routes/imports.file.js';
import idempotency from '../plugins/idempotency.js';
import corsPlugin from '../plugins/cors.js';
import rateLimitPlugin from '../plugins/rate-limit.js';
import authPlugin from '../plugins/auth.js';

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'apps/api/public'),
  prefix: '/',
});

// Register core plugins
await app.register(logging);
await app.register(metrics);
await app.register(errorsPlugin);

// Register security plugins
await app.register(corsPlugin);
await app.register(rateLimitPlugin);
await app.register(authPlugin);

// Register feature plugins
await app.register(featureGuard);
await app.register(idempotency);

await app.register(docsRoutes);
await app.register(authProviders);
await app.register(authSessions);
await app.register(jobEvents);
await app.register(importsFile);

await registerRouteHandlers(app);

const port = Number(process.env.API_PORT ?? 3101);
await app.listen({ host: '0.0.0.0', port });
console.log(`[playlist-manager] API listening on http://0.0.0.0:${port}`);
