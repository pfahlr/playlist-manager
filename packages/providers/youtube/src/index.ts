import type {
  ProviderName, ProviderAuth,
  Importer, Exporter, ProviderImpl,
  ReadPlaylistInput, ReadOptions,
  WritePlaylistInput, WriteOptions, WritePlaylistResult,
  PIF
} from '@app/contracts';

type Opts = {
  backoff?: { retries?: number; baseDelayMs?: number; maxDelayMs?: number };
  batch?: { batchSize?: number };
  baseUrl?: string;
};

export default class YouTube implements ProviderImpl, Importer, Exporter {
  public readonly name: ProviderName = 'youtube';
  private token: string;
  private opts: Required<Opts>;

  constructor(auth: ProviderAuth, opts: Opts = {}) {
    this.token = auth.token;
    this.opts = {
      backoff: { retries: 3, baseDelayMs: 500, maxDelayMs: 8000 },
      batch: { batchSize: 50 },
      baseUrl: 'https://www.googleapis.com/youtube/v3',
      ...opts,
    };
  }

  async readPlaylist(_input: ReadPlaylistInput, _opts?: ReadOptions): Promise<PIF> {
    throw new Error('NIY: youtube readPlaylist');
  }

  async writePlaylist(_input: WritePlaylistInput, _opts?: WriteOptions): Promise<WritePlaylistResult> {
    throw new Error('NIY: youtube writePlaylist');
  }
}
