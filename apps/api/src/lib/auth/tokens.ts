import { prisma } from '@app/db';
import { createKeystore, decryptProviderTokens } from '@app/db/encryption';
import { env } from '../../config/env';
import { refreshSpotifyToken } from './providers/spotify';

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/**
 * Get decrypted provider tokens for a user
 * @param userId - User ID
 * @param provider - Provider name (spotify, deezer, etc.)
 * @returns Decrypted tokens or null if not found
 */
export async function getProviderTokens(
  userId: number,
  provider: string
): Promise<ProviderTokens | null> {
  const account = await prisma.account.findFirst({
    where: {
      user_id: userId,
      provider,
    },
  });

  if (!account) {
    return null;
  }

  // Create keystore for decryption
  const keystore = createKeystore({ masterKey: env.MASTER_KEY });

  // Decrypt tokens
  const decrypted = decryptProviderTokens(
    {
      accountId: account.id,
      access_token_ciphertext: account.access_token_ciphertext || '',
      refresh_token_ciphertext: account.refresh_token_ciphertext || null,
    },
    keystore
  );

  return {
    accessToken: decrypted.accessToken,
    refreshToken: decrypted.refreshToken,
    expiresAt: account.expires_at,
  };
}

/**
 * Check if token is expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;

  // Consider expired if less than 5 minutes remaining
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return expiresAt < fiveMinutesFromNow;
}

/**
 * Get valid access token for a provider, refreshing if needed
 * Automatically refreshes token if expired
 */
export async function getValidProviderToken(
  userId: number,
  provider: string
): Promise<string> {
  let tokens = await getProviderTokens(userId, provider);

  if (!tokens) {
    throw new Error(`No ${provider} account linked for user ${userId}`);
  }

  // Refresh token if expired or about to expire
  if (isTokenExpired(tokens.expiresAt)) {
    if (!tokens.refreshToken) {
      throw new Error(`${provider} token expired and no refresh token available`);
    }

    // Refresh based on provider
    switch (provider) {
      case 'spotify': {
        const refreshed = await refreshSpotifyToken(tokens.refreshToken);

        // Update tokens in database
        const { linkProviderAccount } = await import('./users.js');
        const account = await prisma.account.findFirst({
          where: { user_id: userId, provider },
        });

        if (!account) {
          throw new Error('Account not found after refresh');
        }

        await linkProviderAccount({
          userId,
          provider,
          providerUserId: account.provider_user_id,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || tokens.refreshToken,
          expiresIn: refreshed.expires_in,
        });

        return refreshed.access_token;
      }

      default:
        throw new Error(`Token refresh not implemented for provider: ${provider}`);
    }
  }

  return tokens.accessToken;
}
