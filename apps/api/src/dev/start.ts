import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import docsRoutes from '../routes/docs.js'; // ensure .ts resolves via tsx; .js is ok too
import { registerRouteHandlers } from '../routes/register-handlers.js';
import logging from '../plugins/logging.js';
import metrics from '../plugins/metrics.js';
import featureGuard from '../plugins/feature-guard.js';
import errorsPlugin from '../plugins/errors.js';
import jobEvents from '../routes/jobs.events.js';
import importsFile from '../routes/imports.file.js';

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'apps/api/public'),
  prefix: '/',
});

await app.register(logging);
await app.register(metrics);
await app.register(errorsPlugin);
await app.register(featureGuard);

await app.register(docsRoutes);
await app.register(jobEvents);
await app.register(importsFile);

await registerRouteHandlers(app);

const port = Number(process.env.API_PORT ?? 3101);
await app.listen({ host: '0.0.0.0', port });
console.log(`[playlist-manager] API listening on http://0.0.0.0:${port}`);
