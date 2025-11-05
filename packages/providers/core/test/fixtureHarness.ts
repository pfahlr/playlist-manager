import fs from 'node:fs';
import path from 'node:path';

const MODE = process.env.PROVIDER_FIXTURES === '1' ? 'replay' :
             process.env.PROVIDER_RECORD === '1' ? 'record' : 'live';
const DIR = path.join(process.cwd(), 'packages/providers/core/test/fixtures');

function key(url: string) { return url.replace(/[^a-z0-9]/gi, '_').toLowerCase(); }

export async function fetchFx(url: string, init?: RequestInit) {
  if (MODE === 'live') return fetch(url, init);

  const file = path.join(DIR, key(url) + '.json');
  if (MODE === 'replay') {
    const body = fs.readFileSync(file, 'utf8');
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }

  // record
  const resp = await fetch(url, init);
  const text = await resp.text();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, text);
  return new Response(text, { status: resp.status, headers: resp.headers });
}
