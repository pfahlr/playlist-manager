import fs from 'node:fs';
import path from 'node:path';
import fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { validatePIF } from '@app/contracts';

import errorsPlugin from '../../plugins/errors';
import importsFile from '../imports.file';

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'packages/interop/test/importers/__fixtures__',
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

describe('POST /imports/file', () => {
  async function buildApp() {
    const app = fastify({ logger: false });
    await app.register(errorsPlugin);
    await app.register(importsFile);
    await app.ready();
    return app;
  }

  afterEach(async (ctx) => {
    const app = (ctx as any).app;
    if (app) {
      await app.close();
    }
  });

  it('returns a validated preview for CSV uploads', async (ctx) => {
    const app = await buildApp();
    (ctx as any).app = app;

    const response = await app.inject({
      method: 'POST',
      url: '/imports/file',
      headers: { 'content-type': 'text/csv' },
      payload: loadFixture('csv.lean.csv'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    const expected = loadJson('csv.lean.json');

    expect(body.preview).toEqual(expected);
    expect(body.counts).toEqual({ tracks: expected.tracks.length });

    const validation = validatePIF(body.preview);
    expect(validation.success).toBe(true);
  });

  it('supports extended M3U playlists', async (ctx) => {
    const app = await buildApp();
    (ctx as any).app = app;

    const response = await app.inject({
      method: 'POST',
      url: '/imports/file',
      headers: { 'content-type': 'audio/x-mpegurl' },
      payload: loadFixture('playlist.m3u'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const expected = loadJson('playlist.m3u.json');
    expect(body.preview).toEqual(expected);
    expect(body.counts.tracks).toBe(expected.tracks.length);
  });

  it('returns 400 for unsupported payloads', async (ctx) => {
    const app = await buildApp();
    (ctx as any).app = app;

    const response = await app.inject({
      method: 'POST',
      url: '/imports/file',
      headers: { 'content-type': 'application/octet-stream' },
      payload: 'not a playlist',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body).toMatchObject({
      type: 'about:blank',
      code: expect.stringContaining('unsupported'),
    });
  });

  it('returns 400 when the importer rejects the file', async (ctx) => {
    const app = await buildApp();
    (ctx as any).app = app;

    const response = await app.inject({
      method: 'POST',
      url: '/imports/file',
      headers: { 'content-type': 'text/csv' },
      payload: loadFixture('invalid.csv'),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toMatch(/invalid/i);
  });
});
