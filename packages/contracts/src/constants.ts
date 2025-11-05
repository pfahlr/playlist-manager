export const PROVIDER_NAMES = ['spotify', 'deezer', 'tidal', 'youtube'] as const;
export type Provider = (typeof PROVIDER_NAMES)[number];
