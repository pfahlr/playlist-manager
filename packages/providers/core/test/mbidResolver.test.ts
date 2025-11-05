import { describe, it, expect } from 'vitest';
import { resolveMbid } from '../src/match/mbidResolver';

describe('resolveMbid', () => {
  it('prefers direct mbid', () => {
    const r = resolveMbid({
      provider: { title: 'Xtal', artist: 'Aphex Twin', mbid: 'm-1' },
      catalog: []
    });
    expect(r?.rule).toBe('mbid');
  });

  it('matches by isrc', () => {
    const r = resolveMbid({
      provider: { title: 'Song', artist: 'Artist', isrc: 'US-ABC-123' },
      catalog: [{ mbid: 'm-2', title: 'Song', primaryArtist: 'Artist', isrc: 'US-ABC-123' }]
    });
    expect(r?.rule).toBe('isrc');
  });
});
