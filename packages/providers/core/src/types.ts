export type ProviderName = 'spotify' | 'deezer' | 'tidal' | 'youtube';

export interface NormalizedTrack {
  mbid?: string | null;
  isrc?: string | null;
  title: string;
  primaryArtist: string;
  album?: string | null;
  durationMs?: number | null;
  providerId?: string; // e.g., Spotify track ID
}

export interface NormalizedPlaylist {
  id: string;           // provider playlist id
  title: string;
  description?: string | null;
  itemsCount?: number;
}

export interface Importer {
  readonly name: ProviderName;
  listPlaylists(opts?: { cursor?: string; limit?: number }): Promise<{ data: NormalizedPlaylist[]; nextCursor?: string | null }>;
  getPlaylistItems(playlistId: string, opts?: { cursor?: string; limit?: number }): Promise<{ data: NormalizedTrack[]; nextCursor?: string | null }>;
}

export interface Exporter {
  readonly name: ProviderName;
  createPlaylist(title: string, description?: string | null): Promise<{ id: string }>;
  addItems(playlistId: string, tracks: NormalizedTrack[], opts?: { position?: 'append' | 'head' }): Promise<{ added: number }>;
}

export interface SearchResolver {
  readonly name: ProviderName;
  searchTrack(query: { title: string; artist: string; album?: string; isrc?: string }): Promise<NormalizedTrack | null>;
}

export type ProviderErrorCode =
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'internal'
  | 'network';

export class ProviderError extends Error {
  code: ProviderErrorCode;
  status?: number;
  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
