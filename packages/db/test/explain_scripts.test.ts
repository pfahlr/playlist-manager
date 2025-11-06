import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptsRoot = resolve(__dirname, '../../scripts/explain');
const explainScripts = ['playlists.sql', 'items.sql', 'fuzzy_search.sql'];

describe('EXPLAIN plans', () => {
  test.each(explainScripts)('%s exists and runs ANALYZE', (script) => {
    const content = readFileSync(resolve(scriptsRoot, script), 'utf8');
    expect(content).toMatch(/EXPLAIN\s*\(ANALYZE,\s*BUFFERS\)/i);
  });
});
