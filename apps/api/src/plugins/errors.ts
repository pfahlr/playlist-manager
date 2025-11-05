import fp from 'fastify-plugin';
import { nanoid } from 'nanoid';

import { toProblemBody } from '../lib/problem';

export default fp(async (app) => {
  app.addHook('onRequest', async (req) => {
    (req as any).requestId = req.headers['x-request-id'] || nanoid();
  });

  app.setNotFoundHandler((req, reply) => {
    const status = 404;
    const body = toProblemBody({
      status,
      code: 'not_found',
      message: `Route ${req.method}:${req.url} not found`,
      details: null,
      requestId: (req as any).requestId ?? null,
    });
    reply.status(status).send(body);
  });

  app.setErrorHandler((err, req, reply) => {
    const status = (err as any).statusCode || 500;
    const code =
      (err as any).code || (status === 429 ? 'rate_limited' : status === 404 ? 'not_found' : 'internal');
    const body = toProblemBody({
      status,
      code,
      message: err.message || 'Internal Server Error',
      details: (err as any).details ?? null,
      requestId: (req as any).requestId ?? null,
    });
    reply.status(status).send(body);
  });
});
