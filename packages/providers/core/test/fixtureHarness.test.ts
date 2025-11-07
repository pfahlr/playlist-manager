import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeFetch = globalThis.fetch;
const defaultEnv = {
  fixtures: process.env.PROVIDER_FIXTURES,
  record: process.env.PROVIDER_RECORD,
  dir: process.env.PROVIDER_FIXTURE_DIR,
};

async function loadHarness() {
  vi.resetModules();
  return import('./fixtureHarness');
}

const cleanupDirs = new Set<string>();

afterEach(() => {
  cleanupDirs.forEach((dir) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  });
  cleanupDirs.clear();

  if (nativeFetch) {
    globalThis.fetch = nativeFetch;
  }
  vi.restoreAllMocks();

  if (defaultEnv.fixtures === undefined) delete process.env.PROVIDER_FIXTURES;
  else process.env.PROVIDER_FIXTURES = defaultEnv.fixtures;

  if (defaultEnv.record === undefined) delete process.env.PROVIDER_RECORD;
  else process.env.PROVIDER_RECORD = defaultEnv.record;

  if (defaultEnv.dir === undefined) delete process.env.PROVIDER_FIXTURE_DIR;
  else process.env.PROVIDER_FIXTURE_DIR = defaultEnv.dir;
});

describe('fixtureHarness', () => {
  it('replays stored responses when PROVIDER_FIXTURES=1', async () => {
    process.env.PROVIDER_FIXTURES = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { fetchFx } = await loadHarness();

    const resp = await fetchFx('https://fixtures.test/artist');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resp.status).toBe(206);
    expect(resp.headers.get('x-fixture-source')).toBe('offline');
    await expect(resp.json()).resolves.toEqual({ artist: 'Boards of Canada' });
  });

  it('records fixtures with status and headers when PROVIDER_RECORD=1', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-fixtures-'));
    cleanupDirs.add(tmpDir);

    process.env.PROVIDER_RECORD = '1';
    process.env.PROVIDER_FIXTURE_DIR = tmpDir;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ captured: true }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'x-test': 'fixture',
        },
      }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const { fetchFx } = await loadHarness();
    const resp = await fetchFx('https://record.test/data', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resp.status).toBe(201);
    await expect(resp.json()).resolves.toEqual({ captured: true });

    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);

    const recorded = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
    expect(recorded).toMatchObject({
      url: 'https://record.test/data',
      method: 'POST',
      status: 201,
      headers: {
        'content-type': 'application/json',
        'x-test': 'fixture',
      },
      body: '{"captured":true}',
    });
  });
});
