import fastify from 'fastify';
import { describe, it, expect } from 'vitest';

import errorsPlugin from '../../plugins/errors';
import { registerRouteHandlers } from '../register-handlers';

describe('registerRouteHandlers', () => {
  async function buildApp() {
    const app = fastify({ logger: false });
    await app.register(errorsPlugin);
    await registerRouteHandlers(app);
    await app.ready();
    return app;
  }

  it('registers playlist routes with successful response', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/playlists' });
      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(Array.isArray(payload.data)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('formats not-found responses to match the Error schema', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/__missing__' });
      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toMatchObject({
        type: 'about:blank',
        code: 'not_found',
      });
      expect(typeof body.message).toBe('string');
      expect(body.details).toMatchObject({
        request_id: expect.any(String),
      });
    } finally {
      await app.close();
    }
  });

  it('treats artist unfollow as idempotent', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'DELETE',
        url: '/artists/123e4567-e89b-12d3-a456-426614174000/follow',
      });
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    } finally {
      await app.close();
    }
  });
});
