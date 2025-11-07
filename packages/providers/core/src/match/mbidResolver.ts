export type MatchRule = 'mbid' | 'isrc' | 'exact' | 'fuzzy';

export interface Candidate {
  mbid: string;
  title: string;
  primaryArtist: string;
  durationMs?: number | null;
  isrc?: string | null;
}

export interface CandidateDetails {
  titleScore?: number;
  artistScore?: number;
  durationScore?: number;
  durationDeltaMs?: number;
  descriptorBonus?: number;
}

export interface RankedCandidate {
  candidate: Candidate;
  confidence: number;
  rule: MatchRule;
  details?: CandidateDetails;
}

export interface MatchResult {
  mbid: string;
  confidence: number;
  rule: MatchRule;
  candidates: RankedCandidate[];
}

export interface ProviderTrack {
  title: string;
  artist: string;
  durationMs?: number | null;
  isrc?: string | null;
  mbid?: string | null;
}

export interface ThresholdConfig {
  fuzzyMin: number;
  durationToleranceMs: number;
  fuzzyDurationPenaltyMs: number;
  fuzzyTitleWeight: number;
  fuzzyArtistWeight: number;
  fuzzyDurationWeight: number;
}

export interface ResolveInput {
  provider: ProviderTrack;
  catalog: Candidate[];
  isrcMap?: Record<string, string>;
  thresholds?: Partial<ThresholdConfig>;
}

interface PreparedCandidate {
  candidate: Candidate;
  normalizedTitle: string;
  normalizedArtist: string;
  titleTokens: Set<string>;
  artistTokens: Set<string>;
  descriptors: Set<string>;
}

interface CandidateScore {
  prepared: PreparedCandidate;
  titleScore: number;
  artistScore: number;
  durationScore: number;
  durationDeltaMs?: number;
  combinedScore: number;
  descriptorBonus: number;
}

const DIRECT_CONFIDENCE = 1;
const ISRC_MAP_CONFIDENCE = 0.99;
const ISRC_CATALOG_CONFIDENCE = 0.98;
const EXACT_BASE_CONFIDENCE = 0.94;
const EXACT_DECAY = 0.02;

export function resolveMbid(input: ResolveInput): MatchResult | null {
  const thresholds = resolveThresholds(input.thresholds);
  const provider = input.provider;
  const normalizedCatalog = prepareCatalog(input.catalog);
  const normalizedProviderTitle = normalizeTitle(provider.title);
  const normalizedProviderArtist = normalizeArtist(provider.artist);
  const providerDescriptors = extractDescriptors(normalizedProviderTitle);
  const providerTitleTokens = tokenSet(normalizedProviderTitle);
  const providerArtistTokens = tokenSet(normalizedProviderArtist);
  const candidateScores = buildCandidateScores(
    provider,
    normalizedCatalog,
    providerTitleTokens,
    providerArtistTokens,
    providerDescriptors,
    thresholds,
  );

  if (provider.mbid) {
    return {
      mbid: provider.mbid,
      confidence: DIRECT_CONFIDENCE,
      rule: 'mbid',
      candidates: [],
    };
  }

  const providerIsrc = normalizeIsrc(provider.isrc);
  const normalizedIsrcMap = normalizeIsrcMap(input.isrcMap);

  if (providerIsrc) {
    const mapHit = normalizedIsrcMap?.[providerIsrc];
    if (mapHit) {
      const catalogCandidate =
        normalizedCatalog.find(entry => entry.candidate.mbid === mapHit)?.candidate ??
        normalizedCatalog.find(entry => normalizeIsrc(entry.candidate.isrc) === providerIsrc)?.candidate ??
        {
          mbid: mapHit,
          title: provider.title,
          primaryArtist: provider.artist,
          durationMs: provider.durationMs,
          isrc: provider.isrc,
        };
      return {
        mbid: mapHit,
        confidence: ISRC_MAP_CONFIDENCE,
        rule: 'isrc',
        candidates: [
          createRankedCandidate(
            {
              prepared: {
                candidate: catalogCandidate,
                normalizedArtist: normalizedProviderArtist,
                normalizedTitle: normalizedProviderTitle,
                artistTokens: providerArtistTokens,
                titleTokens: providerTitleTokens,
                descriptors: providerDescriptors,
              },
              titleScore: 1,
              artistScore: 1,
              durationScore: 1,
              combinedScore: 1,
              descriptorBonus: 0,
            },
            'isrc',
            ISRC_MAP_CONFIDENCE,
          ),
        ],
      };
    }

    const catalogHit = normalizedCatalog.find(entry => normalizeIsrc(entry.candidate.isrc) === providerIsrc);
    if (catalogHit) {
      return {
        mbid: catalogHit.candidate.mbid,
        confidence: ISRC_CATALOG_CONFIDENCE,
        rule: 'isrc',
        candidates: [
          createRankedCandidate(
            candidateScores.find(score => score.prepared.candidate.mbid === catalogHit.candidate.mbid)!,
            'isrc',
            ISRC_CATALOG_CONFIDENCE,
          ),
        ],
      };
    }
  }

  const exactMatches = normalizedCatalog.filter(entry =>
    entry.normalizedTitle === normalizedProviderTitle &&
    entry.normalizedArtist === normalizedProviderArtist &&
    withinDuration(provider.durationMs, entry.candidate.durationMs, thresholds.durationToleranceMs)
  );

  if (exactMatches.length) {
    const scoreboard = buildScoreboard(candidateScores, exactMatches.map(match => match.candidate.mbid));
    const winner = scoreboard.find(candidate => candidate.rule === 'exact');
    if (winner) {
      return {
        mbid: winner.candidate.mbid,
        confidence: winner.confidence,
        rule: 'exact',
        candidates: scoreboard,
      };
    }
  }

  const fuzzyMatches = candidateScores
    .filter(score => score.combinedScore > 0)
    .map(score => createRankedCandidate(score, 'fuzzy', score.combinedScore))
    .sort(sortRankedCandidates);

  const bestFuzzy = fuzzyMatches[0];
  if (!bestFuzzy || bestFuzzy.confidence < thresholds.fuzzyMin) {
    return null;
  }

  return {
    mbid: bestFuzzy.candidate.mbid,
    confidence: bestFuzzy.confidence,
    rule: 'fuzzy',
    candidates: fuzzyMatches,
  };
}

function prepareCatalog(catalog: Candidate[]): PreparedCandidate[] {
  return [...catalog]
    .map(candidate => {
      const normalizedTitle = normalizeTitle(candidate.title);
      const normalizedArtist = normalizeArtist(candidate.primaryArtist);
      return {
        candidate,
        normalizedTitle,
        normalizedArtist,
        titleTokens: tokenSet(normalizedTitle),
        artistTokens: tokenSet(normalizedArtist),
        descriptors: extractDescriptors(normalizedTitle),
      };
    })
    .sort((a, b) =>
      a.normalizedTitle.localeCompare(b.normalizedTitle) ||
      a.normalizedArtist.localeCompare(b.normalizedArtist) ||
      a.candidate.mbid.localeCompare(b.candidate.mbid)
    );
}

function buildCandidateScores(
  provider: ProviderTrack,
  catalog: PreparedCandidate[],
  providerTitleTokens: Set<string>,
  providerArtistTokens: Set<string>,
  providerDescriptors: Set<string>,
  thresholds: ThresholdConfig,
): CandidateScore[] {
  return catalog.map(entry => {
    const durationDeltaMs = computeDurationDelta(provider.durationMs, entry.candidate.durationMs);
    const durationScore = computeDurationScore(durationDeltaMs, thresholds);
    const titleScore = diceCoefficient(providerTitleTokens, entry.titleTokens);
    const artistScore = diceCoefficient(providerArtistTokens, entry.artistTokens);
    const descriptorBonus = computeDescriptorBonus(providerDescriptors, entry.descriptors);
    const combinedScore = Math.min(
      1,
      computeCombinedScore(titleScore, artistScore, durationScore, thresholds) + descriptorBonus,
    );
    return {
      prepared: entry,
      titleScore,
      artistScore,
      durationScore,
      durationDeltaMs: durationDeltaMs ?? undefined,
      combinedScore,
      descriptorBonus,
    };
  });
}

function buildScoreboard(scores: CandidateScore[], exactMbids: string[]): RankedCandidate[] {
  return scores
    .filter(score => score.combinedScore > 0 || exactMbids.includes(score.prepared.candidate.mbid))
    .map(score => {
      const idx = exactMbids.indexOf(score.prepared.candidate.mbid);
      if (idx === -1) {
        return createRankedCandidate(score, 'fuzzy', score.combinedScore);
      }
      const confidence = Math.max(0.7, EXACT_BASE_CONFIDENCE - idx * EXACT_DECAY);
      return createRankedCandidate(score, 'exact', confidence);
    })
    .sort(sortRankedCandidates);
}

function createRankedCandidate(score: CandidateScore, rule: MatchRule, confidence: number): RankedCandidate {
  return {
    candidate: score.prepared.candidate,
    confidence: roundScore(confidence),
    rule,
    details: {
      titleScore: roundScore(score.titleScore),
      artistScore: roundScore(score.artistScore),
      durationScore: roundScore(score.durationScore),
      durationDeltaMs: score.durationDeltaMs,
    },
  };
}

function sortRankedCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return a.candidate.mbid.localeCompare(b.candidate.mbid);
}

function roundScore(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 1000;
}

function computeDurationDelta(a?: number | null, b?: number | null): number | null {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return null;
  return Math.abs((a ?? 0) - (b ?? 0));
}

function computeDurationScore(delta: number | null, thresholds: ThresholdConfig): number {
  if (delta === null) return 0.5;
  if (delta <= 0) return 1;
  if (delta >= thresholds.fuzzyDurationPenaltyMs) return 0;
  return 1 - delta / thresholds.fuzzyDurationPenaltyMs;
}

function computeCombinedScore(
  titleScore: number,
  artistScore: number,
  durationScore: number,
  thresholds: ThresholdConfig,
): number {
  const weightSum = thresholds.fuzzyTitleWeight + thresholds.fuzzyArtistWeight + thresholds.fuzzyDurationWeight;
  if (!weightSum) return 0;
  const weighted =
    titleScore * thresholds.fuzzyTitleWeight +
    artistScore * thresholds.fuzzyArtistWeight +
    durationScore * thresholds.fuzzyDurationWeight;
  return weighted / weightSum;
}

function diceCoefficient(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach(token => {
    if (right.has(token)) intersection += 1;
  });
  return (2 * intersection) / (left.size + right.size);
}

function tokenSet(value: string): Set<string> {
  const tokens = value.split(' ').filter(Boolean);
  return new Set(tokens);
}

function extractDescriptors(normalizedTitle: string): Set<string> {
  const descriptors = new Set<string>();
  if (/\blive\b/.test(normalizedTitle)) descriptors.add('live');
  if (/\bacoustic\b/.test(normalizedTitle)) descriptors.add('acoustic');
  if (/\bremaster\b/.test(normalizedTitle)) descriptors.add('remaster');
  if (/\bremix\b/.test(normalizedTitle)) descriptors.add('remix');
  if (/\bdemo\b/.test(normalizedTitle)) descriptors.add('demo');
  if (/\binstrumental\b/.test(normalizedTitle)) descriptors.add('instrumental');
  return descriptors;
}

function computeDescriptorBonus(providerDescriptors: Set<string>, candidateDescriptors: Set<string>): number {
  if (!providerDescriptors.size || !candidateDescriptors.size) return 0;
  let overlap = 0;
  providerDescriptors.forEach(descriptor => {
    if (candidateDescriptors.has(descriptor)) overlap += 1;
  });
  if (!overlap) return 0;
  return Math.min(overlap * 0.03, 0.08);
}

function normalizeTitle(value: string): string {
  return normalizeString(value).replace(/\bremastered\b/g, 'remaster');
}

function normalizeArtist(value: string): string {
  return normalizeString(value.replace(/\b(feat|ft)\.?.*/gi, ''));
}

function normalizeString(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeIsrc(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

function normalizeIsrcMap(map?: Record<string, string>): Record<string, string> | null {
  if (!map) return null;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    const normalizedKey = normalizeIsrc(key);
    if (!normalizedKey) continue;
    normalized[normalizedKey] = value;
  }
  return normalized;
}

function withinDuration(
  providerDuration?: number | null,
  candidateDuration?: number | null,
  tolerance?: number,
): boolean {
  const delta = computeDurationDelta(providerDuration, candidateDuration);
  if (delta === null) return true;
  return delta <= (tolerance ?? 0);
}

function isFiniteNumber(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveThresholds(overrides?: Partial<ThresholdConfig>): ThresholdConfig {
  const defaults: ThresholdConfig = {
    fuzzyMin: envNumber('PROVIDERS_MBID_FUZZY_MIN', 0.68),
    durationToleranceMs: envNumber('PROVIDERS_MBID_DURATION_TOLERANCE_MS', 1500),
    fuzzyDurationPenaltyMs: envNumber('PROVIDERS_MBID_FUZZY_DURATION_PENALTY_MS', 6000),
    fuzzyTitleWeight: envNumber('PROVIDERS_MBID_FUZZY_TITLE_WEIGHT', 0.6),
    fuzzyArtistWeight: envNumber('PROVIDERS_MBID_FUZZY_ARTIST_WEIGHT', 0.3),
    fuzzyDurationWeight: envNumber('PROVIDERS_MBID_FUZZY_DURATION_WEIGHT', 0.1),
  };
  if (!overrides) return defaults;
  return {
    fuzzyMin: overrides.fuzzyMin ?? defaults.fuzzyMin,
    durationToleranceMs: overrides.durationToleranceMs ?? defaults.durationToleranceMs,
    fuzzyDurationPenaltyMs: overrides.fuzzyDurationPenaltyMs ?? defaults.fuzzyDurationPenaltyMs,
    fuzzyTitleWeight: overrides.fuzzyTitleWeight ?? defaults.fuzzyTitleWeight,
    fuzzyArtistWeight: overrides.fuzzyArtistWeight ?? defaults.fuzzyArtistWeight,
    fuzzyDurationWeight: overrides.fuzzyDurationWeight ?? defaults.fuzzyDurationWeight,
  };
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
