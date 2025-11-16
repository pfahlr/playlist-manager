import fastify, { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import errorsPlugin from '../errors';

async function buildApp(registerRoutes?: (app: FastifyInstance) => Promise<void> | void) {
  const app = fastify({ logger: false });
  await app.register(errorsPlugin);
  if (registerRoutes) {
    await registerRoutes(app);
  }
  await app.ready();
  return app;
}

describe('errors plugin', () => {
  it('echoes the x-request-id header in error responses', async () => {
    const app = await buildApp((instance) => {
      instance.get('/echo-request-id', async () => {
        const error = new Error('boom');
        (error as any).statusCode = 400;
        throw error;
      });
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/echo-request-id',
        headers: { 'x-request-id': 'req_test123' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers['x-request-id']).toBe('req_test123');
      const body = response.json();
      expect(body.details).toMatchObject({
        request_id: 'req_test123',
      });
    } finally {
      await app.close();
    }
  });

  it('maps generic Fastify errors to default error codes', async () => {
    const app = await buildApp((instance) => {
      instance.get('/missing-code', async () => {
        const error = new Error('bad input');
        (error as any).statusCode = 400;
        throw error;
      });
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/missing-code' });
      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('bad_request');
    } finally {
      await app.close();
    }
  });
});
