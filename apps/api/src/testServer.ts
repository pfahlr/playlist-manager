// apps/api/src/testServer.ts
import fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { Server } from 'http';

/**
 * By convention, each route module exports either:
 *   - default: (req, reply) => any
 *   - or named export: handler
 *
 * Paths below mirror the planned file structure.
 */
const ROUTES: Array<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  modulePath: string;
  exportName?: 'default' | 'handler';
}> = [
  { method: 'GET',    url: '/playlists',                          modulePath: './routes/playlists/index.get',                     exportName: 'default' },
  { method: 'GET',    url: '/playlists/:id',                      modulePath: './routes/playlists/[id].get',                      exportName: 'default' },
  { method: 'GET',    url: '/playlists/:id/items',                modulePath: './routes/playlists/[id]/items.get',               exportName: 'default' },
  { method: 'GET',    url: '/active-playlist',                    modulePath: './routes/active-playlist/index.get',              exportName: 'default' },
  { method: 'PUT',    url: '/active-playlist',                    modulePath: './routes/active-playlist/index.put',              exportName: 'default' },
  { method: 'POST',   url: '/active-playlist/items',              modulePath: './routes/active-playlist/items/index.post',       exportName: 'default' },
  { method: 'DELETE', url: '/active-playlist/items/:itemId',      modulePath: './routes/active-playlist/items/[itemId].delete',  exportName: 'default' },
  { method: 'POST',   url: '/jobs/migrate',                       modulePath: './routes/jobs/migrate.post',                      exportName: 'default' },
  { method: 'GET',    url: '/jobs/:id',                           modulePath: './routes/jobs/[id].get',                          exportName: 'default' },
  { method: 'POST',   url: '/exports/file',                       modulePath: './routes/exports/file.post',                      exportName: 'default' },
  { method: 'POST',   url: '/artists/:mbid/follow',               modulePath: './routes/artists/[mbid]/follow.post',             exportName: 'default' },
  { method: 'DELETE', url: '/artists/:mbid/follow',               modulePath: './routes/artists/[mbid]/follow.delete',           exportName: 'default' },
  { method: 'GET',    url: '/artists/:mbid',                      modulePath: './routes/artists/[mbid].get',                     exportName: 'default' },
  { method: 'GET',    url: '/artists/:mbid/relations',            modulePath: './routes/artists/[mbid]/relations.get',           exportName: 'default' }
];

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
      reply.code(401).send({ error: 'unauthorized', message: 'Invalid or missing Authorization header' });
    }
  });

  // TODO (later task): attach OpenAPI req/resp validator middleware here.

  for (const r of ROUTES) {
    const mod = await tryImport(r.modulePath);
    if (!mod) continue;

    // pick default export or named 'handler'
    const handler = (mod as any).default ?? (mod as any).handler;
    if (typeof handler !== 'function') continue;

    const opts: RouteShorthandOptions = {};
    app.route({ method: r.method, url: r.url, handler, ...opts });
  }

  await app.ready();
  return app.server;
}

async function tryImport(path: string) {
  try {
    // Allow TS via tsx/vitest by omitting extension
    return await import(path);
  } catch {
    return null;
  }
}
