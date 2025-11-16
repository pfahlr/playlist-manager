import type { PIFDocument } from './pif';
import type { ProviderName } from './providers';

export type MigrationUnresolvedTrack = {
  position: number;
  title: string;
  artists: string[];
  isrc?: string | null;
};

export type MigrationMatchReport = {
  matched_isrc_pct: number;
  matched_fuzzy_pct: number;
  unresolved: MigrationUnresolvedTrack[];
};

export type MigrationMatcherInput = {
  source: PIFDocument;
  destProvider: ProviderName;
};

export type MigrationMatcherResult = {
  playlist: PIFDocument;
  report: MigrationMatchReport;
};

export type MigrationMatcher = (input: MigrationMatcherInput) => Promise<MigrationMatcherResult>;
