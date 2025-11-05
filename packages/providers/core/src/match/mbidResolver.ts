export type MatchRule = 'mbid' | 'isrc' | 'exact' | 'fuzzy';

export interface Candidate {
  mbid: string;
  title: string;
  primaryArtist: string;
  durationMs?: number | null;
  isrc?: string | null;
}

export interface MatchResult {
  mbid: string;
  confidence: number;
  rule: MatchRule;
  candidates: Candidate[];
}

export interface ResolveInput {
  provider: { title: string; artist: string; durationMs?: number | null; isrc?: string | null; mbid?: string | null };
  catalog: Candidate[];
  thresholds?: { fuzzyMin?: number };
}

export function resolveMbid(input: ResolveInput): MatchResult | null {
  const { provider, catalog } = input;
  if (provider.mbid) return { mbid: provider.mbid, confidence: 1.0, rule: 'mbid', candidates: [] };

  if (provider.isrc) {
    const hit = catalog.find(c => (c.isrc ?? '').toUpperCase() === provider.isrc!.toUpperCase());
    if (hit) return { mbid: hit.mbid, confidence: 0.98, rule: 'isrc', candidates: [hit] };
  }

  const exact = catalog.find(c =>
    c.title.toLowerCase() === provider.title.toLowerCase() &&
    c.primaryArtist.toLowerCase() === provider.artist.toLowerCase() &&
    (provider.durationMs && c.durationMs ? Math.abs(c.durationMs - provider.durationMs) < 1500 : true)
  );
  if (exact) return { mbid: exact.mbid, confidence: 0.92, rule: 'exact', candidates: [exact] };

  // naive fuzzy: Jaccard over tokens (replace later with proper scoring)
  const toks = (s: string) => new Set(s.toLowerCase().split(/\s+/));
  let best: { score: number; c: Candidate } | null = null;
  for (const c of catalog) {
    const a = toks(provider.title + ' ' + provider.artist);
    const b = toks(c.title + ' ' + c.primaryArtist);
    const inter = [...a].filter(x => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    const score = union ? inter / union : 0;
    if (!best || score > best.score) best = { score, c };
  }
  if (best && best.score >= (input.thresholds?.fuzzyMin ?? 0.6)) {
    return { mbid: best.c.mbid, confidence: best.score, rule: 'fuzzy', candidates: [best.c] };
  }
  return null;
}
