import type {
  Exporter,
  Importer,
  PIF,
  ProviderImpl,
  ProviderName,
  ReadOptions,
  WriteOptions,
  WritePlaylistResult,
} from '@app/contracts';

export default class Tidal implements ProviderImpl, Importer, Exporter {
  public readonly name: ProviderName = 'tidal';

  constructor(..._args: unknown[]) {}

  async readPlaylist(_id: string, _opts?: ReadOptions): Promise<PIF> {
    throw new Error('NIY');
  }

  async writePlaylist(_pif: PIF, _opts?: WriteOptions): Promise<WritePlaylistResult> {
    throw new Error('NIY');
  }
}
