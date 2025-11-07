import fs from 'node:fs';
import path from 'node:path';

type Mode = 'live' | 'record' | 'replay';

interface FixtureRecord {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  recordedAt: string;
}

const DEFAULT_FIXTURE_DIR = path.join(process.cwd(), 'packages/providers/core/test/fixtures');
const IGNORED_HEADERS = new Set([
  'age',
  'cache-control',
  'connection',
  'date',
  'etag',
  'keep-alive',
  'last-modified',
  'server',
  'set-cookie',
  'transfer-encoding',
  'via',
]);

const sanitize = (input: string): string =>
  input.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();

const getMode = (): Mode => {
  if (process.env.PROVIDER_RECORD === '1') return 'record';
  if (process.env.PROVIDER_FIXTURES === '1') return 'replay';
  return 'live';
};

const resolveDir = (): string => {
  const custom = process.env.PROVIDER_FIXTURE_DIR;
  if (!custom) return DEFAULT_FIXTURE_DIR;
  return path.isAbsolute(custom) ? custom : path.join(process.cwd(), custom);
};

const fixturePath = (url: string, init?: RequestInit): string => {
  const method = (init?.method ?? 'GET').toLowerCase();
  return path.join(resolveDir(), `${method}_${sanitize(url)}.json`);
};

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
};

const headersToObject = (headers: Headers): Record<string, string> => {
  const result = new Map<string, string>();
  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (IGNORED_HEADERS.has(normalized)) return;
    result.set(normalized, result.has(normalized) ? `${result.get(normalized)}, ${value}` : value);
  });
  return Array.from(result.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
};

const loadFixture = (file: string): FixtureRecord => {
  if (!fs.existsSync(file)) {
    throw new Error(
      `[fixtureHarness] Missing fixture "${file}". Re-run with PROVIDER_RECORD=1 or pnpm test:update-fixtures.`,
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as FixtureRecord;
};

const saveFixture = (file: string, record: FixtureRecord) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
};

const respond = (record: FixtureRecord): Response => new Response(record.body, {
  status: record.status,
  headers: record.headers,
});

export async function fetchFx(url: string, init?: RequestInit) {
  const mode = getMode();
  if (mode === 'live') return fetch(url, init);

  const file = fixturePath(url, init);
  if (mode === 'replay') {
    return respond(loadFixture(file));
  }

  const resp = await fetch(url, init);
  const body = await resp.text();
  const record: FixtureRecord = {
    url,
    method: (init?.method ?? 'GET').toUpperCase(),
    status: resp.status,
    headers: headersToObject(resp.headers),
    body,
    recordedAt: new Date().toISOString(),
  };
  saveFixture(file, record);
  return respond(record);
}
