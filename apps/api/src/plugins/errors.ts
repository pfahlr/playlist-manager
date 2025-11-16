import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';

import { toProblemBody } from '../lib/problem';

const DEFAULT_ERROR_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable_entity',
  429: 'rate_limited',
  503: 'service_unavailable',
};

function resolveRequestId(req: FastifyRequest): string {
  const existing = (req as any).requestId;
  if (typeof existing === 'string') {
    return existing;
  }

  const header = req.headers['x-request-id'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  const requestId = typeof headerValue === 'string' && headerValue.length > 0 ? headerValue : nanoid();
  (req as any).requestId = requestId;
  return requestId;
}

export default fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const requestId = resolveRequestId(req);
    reply.header('x-request-id', requestId);
  });

  app.setNotFoundHandler((req, reply) => {
    const status = 404;
    const requestId = resolveRequestId(req);
    reply.header('x-request-id', requestId);
    const body = toProblemBody({
      status,
      code: 'not_found',
      message: `Route ${req.method}:${req.url} not found`,
      requestId,
    });
    reply.status(status).send(body);
  });

  app.setErrorHandler((err, req, reply) => {
    const status = typeof (err as any).statusCode === 'number' ? (err as any).statusCode : 500;
    const requestId = resolveRequestId(req);
    reply.header('x-request-id', requestId);
    const code = (err as any).code ?? DEFAULT_ERROR_CODES[status] ?? 'internal';
    const body = toProblemBody({
      status,
      code,
      message: err.message || 'Internal Server Error',
      details: (err as any).details ?? undefined,
      requestId,
    });
    reply.status(status).send(body);
  });
});
