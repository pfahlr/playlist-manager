import type { ProviderName } from '@app/contracts';

export type ProviderFlags = Record<ProviderName, boolean>;

export const providerFlags: ProviderFlags = {
  spotify: envBool(process.env.PROVIDERS_SPOTIFY ?? 'true'),
  deezer:  envBool(process.env.PROVIDERS_DEEZER  ?? 'true'),
  tidal:   envBool(process.env.PROVIDERS_TIDAL   ?? 'true'),
  youtube: envBool(process.env.PROVIDERS_YOUTUBE ?? 'true'),
};

export function assertEnabled(name: ProviderName) {
  if (!providerFlags[name]) {
    throw new Error(`Provider "${name}" is disabled by feature flag`);
  }
}

function envBool(v: string) {
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}
