import type { FastifyInstance, RouteShorthandOptions } from 'fastify';

export type RouteDefinition = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  modulePath: string;
  exportName?: 'default' | 'handler';
  options?: RouteShorthandOptions;
};

const ROUTES: RouteDefinition[] = [
  { method: 'GET',    url: '/playlists',                     modulePath: './playlists/index.get.js' },
  { method: 'GET',    url: '/playlists/:id',                 modulePath: './playlists/[id].get.js' },
  { method: 'GET',    url: '/playlists/:id/items',           modulePath: './playlists/[id]/items.get.js' },
  { method: 'GET',    url: '/active-playlist',               modulePath: './active-playlist/index.get.js' },
  { method: 'PUT',    url: '/active-playlist',               modulePath: './active-playlist/index.put.js' },
  { method: 'POST',   url: '/active-playlist/items',         modulePath: './active-playlist/items/index.post.js' },
  { method: 'DELETE', url: '/active-playlist/items/:itemId', modulePath: './active-playlist/items/[itemId].delete.js' },
  { method: 'POST',   url: '/jobs/migrate',                  modulePath: './jobs/migrate.post.js' },
  { method: 'GET',    url: '/jobs/:id',                      modulePath: './jobs/[id].get.js' },
  { method: 'POST',   url: '/exports/file',                  modulePath: './exports/file.post.js' },
  { method: 'POST',   url: '/artists/:mbid/follow',          modulePath: './artists/[mbid]/follow.post.js' },
  { method: 'DELETE', url: '/artists/:mbid/follow',          modulePath: './artists/[mbid]/follow.delete.js' },
  { method: 'GET',    url: '/artists/:mbid',                 modulePath: './artists/[mbid].get.js' },
  { method: 'GET',    url: '/artists/:mbid/relations',       modulePath: './artists/[mbid]/relations.get.js' },
];

export async function registerRouteHandlers(app: FastifyInstance): Promise<void> {
  for (const route of ROUTES) {
    const mod = await tryImport(route.modulePath);
    if (!mod) {
      app.log?.warn?.({ modulePath: route.modulePath, method: route.method, url: route.url }, 'Route module missing, skipping registration');
      continue;
    }

    const handler = (mod as any)[route.exportName ?? 'default'] ?? (mod as any).handler;
    if (typeof handler !== 'function') {
      app.log?.warn?.({ modulePath: route.modulePath }, 'Route module missing handler export');
      continue;
    }

    app.route({
      method: route.method,
      url: route.url,
      handler,
      ...(route.options ?? {}),
    });
  }
}

async function tryImport(path: string) {
  try {
    return await import(path);
  } catch (error) {
    if (path.endsWith('.js')) {
      const tsPath = path.slice(0, -3) + '.ts';
      try {
        return await import(tsPath);
      } catch (tsError: any) {
        if ((tsError as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') {
          throw tsError;
        }
      }
    }

    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') {
      throw error;
    }

    return null;
  }
}

export { ROUTES };
