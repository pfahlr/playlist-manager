import { prisma } from '@app/db';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';
import { env } from '../../config/env';

const BCRYPT_ROUNDS = 10;
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface CreateSessionParams {
  userId: number;
  deviceInfo?: string;
  ipAddress?: string;
}

export interface SessionWithTokens {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Create a new session and return refresh token + access token
 * Implements refresh token rotation for security
 */
export async function createSession(
  params: CreateSessionParams
): Promise<SessionWithTokens> {
  const sessionId = `sess_${nanoid(24)}`;
  const tokenFamily = `fam_${nanoid(24)}`;
  const refreshToken = `rt_${nanoid(48)}`;
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  // Create session in database
  await prisma.session.create({
    data: {
      id: sessionId,
      user_id: params.userId,
      token_family: tokenFamily,
      refresh_token_hash: refreshTokenHash,
      device_info: params.deviceInfo,
      ip_address: params.ipAddress,
      expires_at: expiresAt,
    },
  });

  // Generate access token (JWT)
  const { signSession } = await import('./session.js');
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: params.userId },
  });

  const accessToken = signSession({
    userId: user.id,
    email: user.email,
    provider: 'session', // Generic provider for session-based auth
  });

  return {
    sessionId,
    accessToken,
    refreshToken,
    expiresAt,
  };
}

/**
 * Refresh an access token using a refresh token
 * Implements token rotation: old refresh token is replaced with new one
 *
 * Security: If refresh token is reused (replay attack), entire token family is revoked
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshResult> {
  // Find all sessions (we'll check hash against each to find the match)
  const sessions = await prisma.session.findMany({
    where: {
      expires_at: { gt: new Date() },
      revoked_at: null,
    },
    include: { user: true },
  });

  // Find the session that matches this refresh token
  let matchedSession: typeof sessions[0] | null = null;

  for (const session of sessions) {
    const matches = await bcrypt.compare(refreshToken, session.refresh_token_hash);
    if (matches) {
      matchedSession = session;
      break;
    }
  }

  if (!matchedSession) {
    return { success: false, error: 'Invalid or expired refresh token' };
  }

  // Check if session is expired
  if (matchedSession.expires_at < new Date()) {
    return { success: false, error: 'Session expired' };
  }

  // Generate new refresh token and rotate
  const newRefreshToken = `rt_${nanoid(48)}`;
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, BCRYPT_ROUNDS);

  // Update session with new refresh token hash and last_used_at
  await prisma.session.update({
    where: { id: matchedSession.id },
    data: {
      refresh_token_hash: newRefreshTokenHash,
      last_used_at: new Date(),
    },
  });

  // Generate new access token
  const { signSession } = await import('./session.js');
  const accessToken = signSession({
    userId: matchedSession.user.id,
    email: matchedSession.user.email,
    provider: 'session',
  });

  return {
    success: true,
    accessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Revoke a specific session (logout)
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      revoked_at: null,
    },
    data: {
      revoked_at: new Date(),
    },
  });

  return result.count > 0;
}

/**
 * Revoke all sessions for a user (logout all devices)
 */
export async function revokeAllUserSessions(userId: number): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      user_id: userId,
      revoked_at: null,
    },
    data: {
      revoked_at: new Date(),
    },
  });

  return result.count;
}

/**
 * List all active sessions for a user
 */
export async function listUserSessions(userId: number) {
  return prisma.session.findMany({
    where: {
      user_id: userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    select: {
      id: true,
      device_info: true,
      ip_address: true,
      created_at: true,
      last_used_at: true,
      expires_at: true,
    },
    orderBy: {
      last_used_at: 'desc',
    },
  });
}

/**
 * Cleanup expired sessions (run periodically via cron)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expires_at: { lt: new Date() } },
        { revoked_at: { not: null } },
      ],
    },
  });

  return result.count;
}
