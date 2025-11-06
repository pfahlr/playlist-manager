import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import docsRoutes from '../docs';

describe('docs routes', () => {
  it('registers /openapi.yaml to stream the repository spec', async () => {
    const get = vi.fn();
    const app = { get } as any;

    await docsRoutes(app);

    const specRoute = get.mock.calls.find(([route]) => route === '/openapi.yaml');
    expect(specRoute).toBeDefined();

    const handler = specRoute?.[1];
    expect(typeof handler).toBe('function');

    const type = vi.fn().mockReturnThis();
    const sendFile = vi.fn();
    await handler?.({}, { type, sendFile });

    expect(type).toHaveBeenCalledWith('text/yaml');
    expect(sendFile).toHaveBeenCalledWith('openapi.yaml', path.resolve(process.cwd()));
  });

  it('registers /docs to serve the docs shell', async () => {
    const get = vi.fn();
    const app = { get } as any;

    await docsRoutes(app);

    const docsRoute = get.mock.calls.find(([route]) => route === '/docs');
    expect(docsRoute).toBeDefined();

    const handler = docsRoute?.[1];
    expect(typeof handler).toBe('function');

    const type = vi.fn().mockReturnThis();
    const sendFile = vi.fn();
    await handler?.({}, { type, sendFile });

    expect(type).toHaveBeenCalledWith('text/html');
    expect(sendFile).toHaveBeenCalledWith('docs/index.html');
  });
});

describe('docs HTML shell', () => {
  it('links to the OpenAPI spec and embeds it for rendering', async () => {
    const htmlPath = path.join(process.cwd(), 'apps/api/public/docs/index.html');
    const html = await fs.readFile(htmlPath, 'utf8');

    expect(html).toContain('spec-url="/openapi.yaml"');
    expect(html).toContain('href="/openapi.yaml"');
  });
});
