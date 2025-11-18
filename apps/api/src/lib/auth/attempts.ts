import { prisma } from '@app/db';
import { nanoid } from 'nanoid';

export interface CreateAttemptParams {
  provider: 'spotify' | 'deezer' | 'tidal' | 'youtube';
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  nonce?: string;
  expiresInMinutes?: number;
}

export interface UpdateAttemptParams {
  status?: 'pending' | 'succeeded' | 'failed' | 'expired';
  userId?: number;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
  errorDescription?: string;
  codeVerifier?: string;
}

export interface OAuthAttempt {
  id: string;
  provider: string;
  codeChallenge: string;
  codeVerifier: string | null;
  redirectUri: string;
  state: string | null;
  nonce: string | null;
  status: string;
  userId: number | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  error: string | null;
  errorDescription: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new OAuth attempt
 * Returns attempt_id to track the authorization flow
 */
export async function createAttempt(params: CreateAttemptParams): Promise<OAuthAttempt> {
  const attemptId = `att_${nanoid(24)}`;
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes || 10) * 60 * 1000);

  const attempt = await prisma.oAuthAttempt.create({
    data: {
      id: attemptId,
      provider: params.provider,
      code_challenge: params.codeChallenge,
      redirect_uri: params.redirectUri,
      state: params.state || attemptId, // Use attempt ID as state if not provided
      nonce: params.nonce,
      status: 'pending',
      expires_at: expiresAt,
    },
  });

  return attempt as OAuthAttempt;
}

/**
 * Look up an OAuth attempt by ID
 * Returns null if not found or expired
 */
export async function lookupAttempt(attemptId: string): Promise<OAuthAttempt | null> {
  const attempt = await prisma.oAuthAttempt.findUnique({
    where: { id: attemptId },
  });

  if (!attempt) {
    return null;
  }

  // Check if expired
  if (attempt.expires_at < new Date()) {
    // Mark as expired if not already
    if (attempt.status === 'pending') {
      await prisma.oAuthAttempt.update({
        where: { id: attemptId },
        data: { status: 'expired', updated_at: new Date() },
      });
    }
    return { ...attempt, status: 'expired' } as OAuthAttempt;
  }

  return attempt as OAuthAttempt;
}

/**
 * Look up an OAuth attempt by state parameter
 * Used during OAuth callback to find the original attempt
 */
export async function lookupAttemptByState(state: string): Promise<OAuthAttempt | null> {
  const attempt = await prisma.oAuthAttempt.findFirst({
    where: { state },
  });

  if (!attempt) {
    return null;
  }

  // Check if expired
  if (attempt.expires_at < new Date()) {
    if (attempt.status === 'pending') {
      await prisma.oAuthAttempt.update({
        where: { id: attempt.id },
        data: { status: 'expired', updated_at: new Date() },
      });
    }
    return { ...attempt, status: 'expired' } as OAuthAttempt;
  }

  return attempt as OAuthAttempt;
}

/**
 * Update an OAuth attempt (e.g., mark as succeeded with tokens)
 */
export async function updateAttempt(
  attemptId: string,
  updates: UpdateAttemptParams
): Promise<OAuthAttempt> {
  const attempt = await prisma.oAuthAttempt.update({
    where: { id: attemptId },
    data: {
      ...(updates.status && { status: updates.status }),
      ...(updates.userId !== undefined && { user_id: updates.userId }),
      ...(updates.accessToken !== undefined && { access_token: updates.accessToken }),
      ...(updates.refreshToken !== undefined && { refresh_token: updates.refreshToken }),
      ...(updates.expiresIn !== undefined && { expires_in: updates.expiresIn }),
      ...(updates.error !== undefined && { error: updates.error }),
      ...(updates.errorDescription !== undefined && { error_description: updates.errorDescription }),
      ...(updates.codeVerifier !== undefined && { code_verifier: updates.codeVerifier }),
      updated_at: new Date(),
    },
  });

  return attempt as OAuthAttempt;
}

/**
 * Mark attempt as failed with error details
 */
export async function failAttempt(
  attemptId: string,
  error: string,
  errorDescription?: string
): Promise<OAuthAttempt> {
  return updateAttempt(attemptId, {
    status: 'failed',
    error,
    errorDescription,
  });
}

/**
 * Mark attempt as succeeded with user ID and tokens
 * Note: For task 10d, tokens are returned from attempt polling, not stored in attempt table long-term
 */
export async function succeedAttempt(
  attemptId: string,
  userId: number,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<OAuthAttempt> {
  return updateAttempt(attemptId, {
    status: 'succeeded',
    userId,
    accessToken,
    refreshToken,
    expiresIn,
  });
}

/**
 * Clean up expired attempts (run periodically)
 */
export async function cleanupExpiredAttempts(): Promise<number> {
  const result = await prisma.oAuthAttempt.deleteMany({
    where: {
      expires_at: {
        lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Delete attempts older than 24 hours
      },
    },
  });

  return result.count;
}
