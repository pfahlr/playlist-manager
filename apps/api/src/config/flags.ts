export type ProviderFlagName = 'spotify' | 'deezer' | 'tidal' | 'youtube';

const bool = (v: string | undefined, d = false) =>
  v ? ['1','true','yes','on'].includes(v.toLowerCase()) : d;

export const flags: { providers: Record<ProviderFlagName, boolean> } = {
  providers: {
    spotify: bool(process.env.PROVIDERS_SPOTIFY_ENABLED, true),
    deezer:  bool(process.env.PROVIDERS_DEEZER_ENABLED, false),
    tidal:   bool(process.env.PROVIDERS_TIDAL_ENABLED, false),
    youtube: bool(process.env.PROVIDERS_YOUTUBE_ENABLED, false)
  }
};

export function isProviderEnabled(name: ProviderFlagName): boolean {
  return !!flags.providers[name];
}

export function getEnabledProviders(): ProviderFlagName[] {
  return (Object.entries(flags.providers) as Array<[ProviderFlagName, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}
