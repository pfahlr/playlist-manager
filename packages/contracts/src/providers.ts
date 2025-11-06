// packages/contracts/src/providers.ts

/** Canonical provider IDs used across the app & OpenAPI spec */
export type ProviderName = 'spotify' | 'deezer' | 'tidal' | 'youtube';

/** Minimal PIF v1 types (keep in sync with /schemas/pif-v1.schema.json) */
export interface PIF {
  name: string;
  description?: string | null;
  source_service?: ProviderName | 'amazon' | null;
  source_playlist_id?: string | null;
  tracks: PIFTrack[];
}

export interface PIFTrack {
  position: number;                // 1-based
  title: string;
  artists: string[];               // primary first; features after
  album?: string | null;
  duration_ms?: number | null;
  explicit?: boolean | null;
  release_date?: string | null;    // YYYY or YYYY-MM or YYYY-MM-DD
  isrc?: string | null;
  mb_recording_id?: string | null; // UUID
  mb_release_id?: string | null;   // UUID
  provider_ids?: {
    spotify_track_id?: string | null;
    deezer_track_id?: string | null;
    tidal_track_id?: string | null;
    youtube_video_id?: string | null;
    amazon_track_id?: string | null;
  };
}

/** Shared errors & config */
export class RateLimitError extends Error {
  constructor(message: string, public retryAfterMs?: number) { super(message); }
}

export interface BackoffOptions {
  /** max retries on 429/5xx */
  retries?: number;           // default 3
  /** base delay in ms for exponential backoff */
  baseDelayMs?: number;       // default 500
  /** optional hard ceiling */
  maxDelayMs?: number;        // default 8000
}

export interface BatchOptions {
  /** max items per add-items call */
  batchSize?: number;         // e.g., 100
}

export interface ProviderAuth {
  /** OAuth access token (bearer) or API key as applicable */
  token: string;
}

/** Importer: read a provider playlist into PIF */
export interface Importer {
  readonly name: ProviderName;
  readPlaylist(id: string, opts?: ReadOptions): Promise<PIF>;
}

export interface ReadOptions {
  pageSize?: number;          // provider page size (default sensible per provider)
  backoff?: BackoffOptions;
}

/** Exporter: write a PIF playlist to a provider */
export interface Exporter {
  readonly name: ProviderName;
  writePlaylist(pif: PIF, opts?: WriteOptions): Promise<WritePlaylistResult>;
}

export interface WriteOptions {
  batch?: BatchOptions;
  backoff?: BackoffOptions;
}

export interface WritePlaylistResult {
  destId: string;                   // provider playlist id
  report: {
    attempted: number;             // total tracks processed
    added: number;                 // successfully added
    failed: number;                // failed adds
    skipped?: number;              // dedupes, etc.
    notes?: string[];
  };
}

/** Convenience union for classes that do both */
export type ProviderImpl = Importer & Exporter;
