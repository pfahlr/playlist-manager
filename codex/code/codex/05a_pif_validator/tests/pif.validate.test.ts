import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validatePIF } from '../../../../../packages/contracts/src/pif.ts';

type FixtureName = 'valid.playlist.json' | 'invalid.playlist.json';

const loadFixture = (name: FixtureName) => {
  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', name);
  return JSON.parse(readFileSync(fixturePath, 'utf-8'));
};

describe('validatePIF', () => {
  it('accepts the valid PIF fixture', () => {
    const result = validatePIF(loadFixture('valid.playlist.json'));

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects the invalid PIF fixture and emits detailed errors', () => {
    const result = validatePIF(loadFixture('invalid.playlist.json'));

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((error) => error.keyword === 'additionalProperties')).toBe(true);
    expect(result.errors.some((error) => error.instancePath.includes('/tracks/0/position'))).toBe(true);
  });
});
