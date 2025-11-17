import type {
  ProviderName, ProviderImpl, ProviderAuth,
  WriteOptions, ReadOptions
} from '@app/contracts';

import { prisma } from '@app/db';
import { createKeystore, decryptProviderTokens } from '@app/db/encryption';
import Spotify from '@app/providers-spotify';
import Deezer  from '@app/providers-deezer';
import Tidal   from '@app/providers-tidal';
import YouTube from '@app/providers-youtube';
import { assertEnabled, workerConfig } from './config';

/** Thrown when a user has not linked the requested provider. */
export class MissingProviderAuthError extends Error {
  constructor(public userId: number, public provider: ProviderName) {
    super(`No linked account for provider "${provider}" (user_id=${userId})`);
  }
}

/** Optional knobs shared by all providers (batch/backoff URLs can be overridden in tests). */
export type ProviderCreateOpts = {
  read?: ReadOptions;
  write?: WriteOptions;
  baseUrlOverride?: string; // useful in unit tests
};

/** Fetch the OAuth bearer token for a user+provider from the account table. */
export async function getProviderAuthForUser(
  userId: number,
  provider: ProviderName
): Promise<ProviderAuth> {
  // Our schema stores provider as a string; use same literals as ProviderName
  const acct = await prisma.account.findFirst({
    where: { user_id: userId, provider },
    select: {
      id: true,
      access_token_ciphertext: true,
      refresh_token_ciphertext: true,
    },
  });

  if (!acct) {
    throw new MissingProviderAuthError(userId, provider);
  }

  // Decrypt the tokens using the encryption keystore
  const keystore = createKeystore({ masterKey: workerConfig.masterKey });
  const decrypted = decryptProviderTokens(
    {
      accountId: acct.id,
      access_token_ciphertext: acct.access_token_ciphertext,
      refresh_token_ciphertext: acct.refresh_token_ciphertext,
    },
    keystore
  );

  const token = decrypted.accessToken;
  if (!token) {
    throw new MissingProviderAuthError(userId, provider);
  }

  return { token };
}

/** Create an instance given a provider name and auth. */
export function createProvider(
  name: ProviderName,
  auth: ProviderAuth,
  opts: ProviderCreateOpts = {}
): ProviderImpl {
  assertEnabled(name);

  switch (name) {
    case 'spotify':
      return new Spotify(auth, {
        baseUrl: opts.baseUrlOverride ?? 'https://api.spotify.com/v1',
        batch: opts.write?.batch,
        backoff: opts.write?.backoff,
      } as any);
    case 'deezer':
      return new Deezer(auth, {
        baseUrl: opts.baseUrlOverride ?? 'https://api.deezer.com',
        batch: opts.write?.batch,
        backoff: opts.write?.backoff,
      } as any);
    case 'tidal':
      return new Tidal(auth, {
        baseUrl: opts.baseUrlOverride ?? 'https://api.tidal.com/v1',
        batch: opts.write?.batch,
        backoff: opts.write?.backoff,
      } as any);
    case 'youtube':
      return new YouTube(auth, {
        baseUrl: opts.baseUrlOverride ?? 'https://www.googleapis.com/youtube/v3',
        batch: opts.write?.batch,
        backoff: opts.write?.backoff,
      } as any);
    default:
      // Exhaustive check – should be unreachable with the ProviderName union
      throw new Error(`Unsupported provider: ${name satisfies never}`);
  }
}

/** Lightweight factory alias to reduce callsites touching createProvider directly. */
export function getProvider(
  name: ProviderName,
  auth: ProviderAuth,
  opts: ProviderCreateOpts = {}
): ProviderImpl {
  return createProvider(name, auth, opts);
}

/**
 * Convenience: build a provider instance for a specific user.
 * Throws MissingProviderAuthError if the user hasn’t linked that provider.
 */
export async function getProviderForUser(
  userId: number,
  name: ProviderName,
  opts: ProviderCreateOpts = {}
): Promise<ProviderImpl> {
  const auth = await getProviderAuthForUser(userId, name);
  return getProvider(name, auth, opts);
}
