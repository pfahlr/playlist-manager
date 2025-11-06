import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { validatePIF } from '@app/contracts';

import { parseCsvToPif } from '../../src/importers/csv';
import { parseM3uToPif } from '../../src/importers/m3u';
import { parseXspfToPif } from '../../src/importers/xspf';
import { parsePlsToPif } from '../../src/importers/pls';
import { parseWplToPif } from '../../src/importers/wpl';

const FIXTURES_DIR = path.join(__dirname, '__fixtures__');

function loadText(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

function loadJson<T = unknown>(name: string): T {
  return JSON.parse(loadText(name)) as T;
}

function expectValidPIF(document: unknown) {
  const validation = validatePIF(document);
  if (!validation.success) {
    throw new Error(`Expected valid PIF but received validation errors: ${JSON.stringify(validation.errors)}`);
  }
}

describe('CSV importer', () => {
  it('converts lean CSV into a normalized PIF document', () => {
    const csv = loadText('csv.lean.csv');
    const result = parseCsvToPif(csv);
    expect(result).toEqual(loadJson('csv.lean.json'));
    expectValidPIF(result);
  });

  it('honors verbose CSV columns when present', () => {
    const csv = loadText('csv.verbose.csv');
    const result = parseCsvToPif(csv);
    expect(result).toEqual(loadJson('csv.verbose.json'));
    expectValidPIF(result);
  });

  it('rejects CSV payloads that do not match the schema', () => {
    const csv = loadText('invalid.csv');
    expect(() => parseCsvToPif(csv)).toThrowError(/invalid/i);
  });
});

describe('M3U importer', () => {
  it('parses extended M3U playlists into PIF', () => {
    const m3u = loadText('playlist.m3u');
    const result = parseM3uToPif(m3u);
    expect(result).toEqual(loadJson('playlist.m3u.json'));
    expectValidPIF(result);
  });

  it('rejects malformed M3U payloads', () => {
    const m3u = loadText('invalid.m3u');
    expect(() => parseM3uToPif(m3u)).toThrowError(/invalid/i);
  });
});

describe('XSPF importer', () => {
  it('converts XSPF XML playlists', () => {
    const xml = loadText('playlist.xspf');
    const result = parseXspfToPif(xml);
    expect(result).toEqual(loadJson('playlist.xspf.json'));
    expectValidPIF(result);
  });
});

describe('PLS importer', () => {
  it('parses PLS playlists with durations', () => {
    const pls = loadText('playlist.pls');
    const result = parsePlsToPif(pls);
    expect(result).toEqual(loadJson('playlist.pls.json'));
    expectValidPIF(result);
  });
});

describe('WPL importer', () => {
  it('reads Windows playlist XML', () => {
    const wpl = loadText('playlist.wpl');
    const result = parseWplToPif(wpl);
    expect(result).toEqual(loadJson('playlist.wpl.json'));
    expectValidPIF(result);
  });
});
