import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type PIFDocument } from '../../../../../packages/contracts/src/pif.ts';
import {
  renderCsv,
  renderM3U,
  renderXSPF,
} from '../../../../../packages/providers/file-exporters/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');
const goldensDir = join(here, 'goldens');

const loadFixture = (name: string): PIFDocument =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));

const loadGolden = (name: string): string =>
  readFileSync(join(goldensDir, name), 'utf-8');

describe('file exporters', () => {
  const playlist = loadFixture('sample.playlist.json');

  it('renders M3U output that matches the golden file', () => {
    expect(renderM3U(playlist)).toEqual(loadGolden('playlist.m3u'));
  });

  it('renders XSPF output that matches the golden file', () => {
    expect(renderXSPF(playlist)).toEqual(loadGolden('playlist.xspf'));
  });

  it('renders lean CSV output according to the golden file', () => {
    expect(renderCsv(playlist, 'lean')).toEqual(loadGolden('playlist.lean.csv'));
  });

  it('renders verbose CSV output according to the golden file', () => {
    expect(renderCsv(playlist, 'verbose')).toEqual(
      loadGolden('playlist.verbose.csv'),
    );
  });
});
