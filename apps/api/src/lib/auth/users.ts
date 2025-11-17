import { PrismaClient } from '@prisma/client';
import { createKeystore, encryptProviderTokens } from '@app/db/encryption';
import { env } from '../../config/env';

const prisma = new PrismaClient();

export interface CreateUserParams {
  email: string;
  name?: string | null;
}

export interface LinkProviderAccountParams {
  userId: number;
  provider: string;
  providerUserId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * Find or create a user by email
 * Returns existing user if email exists, otherwise creates new user
 */
export async function findOrCreateUser(params: CreateUserParams): Promise<{ id: number; email: string; name: string | null }> {
  // Try to find existing user by email
  const existingUser = await prisma.user.findUnique({
    where: { email: params.email },
    select: { id: true, email: true, name: true },
  });

  if (existingUser) {
    return existingUser;
  }

  // Create new user
  const newUser = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name || null,
    },
    select: { id: true, email: true, name: true },
  });

  return newUser;
}

/**
 * Link or update provider account for a user
 * Encrypts tokens before storing in database
 */
export async function linkProviderAccount(params: LinkProviderAccountParams): Promise<void> {
  // Create keystore for token encryption
  const keystore = createKeystore({ masterKey: env.MASTER_KEY });

  // Calculate token expiration
  const expiresAt = params.expiresIn
    ? new Date(Date.now() + params.expiresIn * 1000)
    : null;

  // Encrypt tokens
  const encrypted = encryptProviderTokens(
    {
      accountId: 0, // Will be set by database
      accessToken: params.accessToken,
      refreshToken: params.refreshToken || null,
    },
    keystore
  );

  // Upsert provider account (update if exists, create if not)
  await prisma.account.upsert({
    where: {
      provider_provider_user_id: {
        provider: params.provider,
        provider_user_id: params.providerUserId,
      },
    },
    create: {
      user_id: params.userId,
      provider: params.provider,
      provider_user_id: params.providerUserId,
      access_token_ciphertext: encrypted.access_token_ciphertext,
      refresh_token_ciphertext: encrypted.refresh_token_ciphertext,
      expires_at: expiresAt,
    },
    update: {
      user_id: params.userId, // Update user_id in case account was transferred
      access_token_ciphertext: encrypted.access_token_ciphertext,
      refresh_token_ciphertext: encrypted.refresh_token_ciphertext,
      expires_at: expiresAt,
    },
  });
}

/**
 * Find user by provider account
 */
export async function findUserByProviderAccount(
  provider: string,
  providerUserId: string
): Promise<{ id: number; email: string; name: string | null } | null> {
  const account = await prisma.account.findUnique({
    where: {
      provider_provider_user_id: {
        provider,
        provider_user_id: providerUserId,
      },
    },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  return account?.user || null;
}
