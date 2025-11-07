import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MatchResult, ResolveInput } from '../src/match/mbidResolver';
import { resolveMbid } from '../src/match/mbidResolver';

const FIXTURE_DIR = path.join(process.cwd(), 'packages/providers/core/fixtures');

interface ResolverFixture extends ResolveInput {
  name: string;
  expected: {
    rule: string;
    mbid: string;
    candidateOrder: string[];
    confidenceAtLeast: number;
  };
}

const loadFixture = (name: string): ResolverFixture =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')) as ResolverFixture;

describe('resolveMbid', () => {
  it('prefers direct mbid', () => {
    const r = resolveMbid({
      provider: { title: 'Xtal', artist: 'Aphex Twin', mbid: 'm-1' },
      catalog: [],
    });

    expect(r?.rule).toBe('mbid');
    expect(r?.confidence).toBe(1);
    expect(r?.candidates).toEqual([]);
  });

  it('maps via explicit ISRC index before heuristics', () => {
    const r = resolveMbid({
      provider: { title: 'Song', artist: 'Artist', isrc: 'US-ABC-123' },
      catalog: [
        { mbid: 'm-2', title: 'Song', primaryArtist: 'Artist', durationMs: 201000 },
      ],
      isrcMap: { 'US-ABC-123': 'mapped-mbid-42' },
    });

    expect(r?.rule).toBe('isrc');
    expect(r?.mbid).toBe('mapped-mbid-42');
  });

  for (const fixtureName of ['live_variation', 'remaster_ladder'] as const) {
    it(`matches golden fixture: ${fixtureName}`, () => {
      const fx = loadFixture(fixtureName);
      const { expected, name: _name, ...input } = fx;
      const result = resolveMbid(input);
      expect(result).not.toBeNull();
      const match = result as MatchResult;

      expect(match.rule).toBe(expected.rule);
      expect(match.mbid).toBe(expected.mbid);
      expect(match.confidence).toBeGreaterThanOrEqual(expected.confidenceAtLeast);
      expect(match.candidates.length).toBeGreaterThanOrEqual(expected.candidateOrder.length);

      const ordered = match.candidates.map(c => c.candidate.mbid);
      expect(ordered.slice(0, expected.candidateOrder.length)).toEqual(expected.candidateOrder);
      expect(typeof match.candidates[0]?.confidence).toBe('number');
    });
  }

  it('honors fuzzy threshold overrides', () => {
    const fx = loadFixture('live_variation');
    const result = resolveMbid({
      provider: fx.provider,
      catalog: fx.catalog,
      thresholds: { fuzzyMin: 0.99 },
    });
    expect(result).toBeNull();
  });
});
