import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';

// We'll mock @app/db BEFORE importing the factory
vi.mock('../../../../../packages/db/src/client', () => {
  // In case someone imports via @app/db barrel:
  return { prisma: { account: { findFirst: vi.fn() } } };
});
vi.mock('@app/db', async () => {
  const mod = await vi.importActual<any>('../../../../../packages/db/src/index.ts');
  // Ensure a mockable prisma exists no matter which path code uses
  return { ...mod, prisma: { account: { findFirst: vi.fn() } } };
});

// Reusable getters to re-import modules after env or mocks change
async function loadFactory() {
  // Ensure a fresh module state to pick up env flags
  await vi.resetModules();
  // Re-apply mocks after reset
  vi.doMock('../../../../../packages/db/src/client', () => ({ prisma: { account: { findFirst: vi.fn() } } }));
  vi.doMock('@app/db', async () => {
    const mod = await vi.importActual<any>('../../../../../packages/db/src/index.ts');
    return { ...mod, prisma: { account: { findFirst: vi.fn() } } };
  });
  const prov = await import('../../../../../apps/worker/src/providers');
  const db = await import('@app/db');
  const Spotify = (await import('../../../../../packages/providers/spotify/src/index.ts')).default;
  const Deezer  = (await import('../../../../../packages/providers/deezer/src/index.ts')).default;
  const Tidal   = (await import('../../../../../packages/providers/tidal/src/index.ts')).default;
  const YouTube = (await import('../../../../../packages/providers/youtube/src/index.ts')).default;
  return { prov, db, Spotify, Deezer, Tidal, YouTube };
}

describe('provider factory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.PROVIDERS_SPOTIFY = 'true';
    process.env.PROVIDERS_DEEZER  = 'true';
    process.env.PROVIDERS_TIDAL   = 'true';
    process.env.PROVIDERS_YOUTUBE = 'true';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('getProviderAuthForUser: returns token and throws MissingProviderAuthError when missing', async () => {
    const { prov, db } = await loadFactory();
    // First call returns a token
    (db.prisma.account.findFirst as any).mockResolvedValueOnce({ access_token: 'tok-123' });
    const auth = await prov.getProviderAuthForUser(1, 'spotify');
    expect(auth.token).toBe('tok-123');

    // Next call returns null -> should throw
    (db.prisma.account.findFirst as any).mockResolvedValueOnce(null);
    await expect(prov.getProviderAuthForUser(1, 'spotify')).rejects.toBeInstanceOf(prov.MissingProviderAuthError);
  });

  test('createProvider: returns correct classes with matching names', async () => {
    const { prov, Spotify, Deezer, Tidal, YouTube } = await loadFactory();

    const s = prov.createProvider('spotify', { token: 'x' });
    expect(s.name).toBe('spotify');
    expect(s).toBeInstanceOf(Spotify);

    const d = prov.createProvider('deezer', { token: 'x' });
    expect(d.name).toBe('deezer');
    expect(d).toBeInstanceOf(Deezer);

    const t = prov.createProvider('tidal', { token: 'x' });
    expect(t.name).toBe('tidal');
    expect(t).toBeInstanceOf(Tidal);

    const y = prov.createProvider('youtube', { token: 'x' });
    expect(y.name).toBe('youtube');
    expect(y).toBeInstanceOf(YouTube);
  });

  test('feature flags: disabling a provider blocks creation', async () => {
    process.env.PROVIDERS_SPOTIFY = 'false';
    const { prov } = await loadFactory();
    expect(() => prov.createProvider('spotify', { token: 'z' })).toThrow(/disabled/i);
  });

  test('getProviderForUser: combines token fetch + instance creation', async () => {
    const { prov, db, Spotify } = await loadFactory();
    (db.prisma.account.findFirst as any).mockResolvedValue({ access_token: 'tok-xyz' });
    const inst = await prov.getProviderForUser(42, 'spotify');
    expect(inst).toBeInstanceOf(Spotify);
    expect(inst.name).toBe('spotify');
  });
});
