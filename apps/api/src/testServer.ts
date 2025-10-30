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
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  modulePath: string;
  exportName?: 'default' | 'handler';
}> = [
  { method: 'GET',    url: '/api/v1/playlists/:id/items', modulePath: './routes/playlists/[id]/items.get', exportName: 'default' },
  { method: 'POST',   url: '/api/v1/exports/file',         modulePath: './routes/exports/file.post',       exportName: 'default' },
  { method: 'POST',   url: '/api/v1/jobs/migrate',         modulePath: './routes/jobs/migrate.post',       exportName: 'default' },
  { method: 'DELETE', url: '/api/v1/active-playlist/items/:itemId', modulePath: './routes/active-playlist/items/[itemId].delete', exportName: 'default' }
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
