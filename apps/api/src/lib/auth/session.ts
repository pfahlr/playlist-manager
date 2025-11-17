import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export interface SessionPayload {
  userId: number;
  email: string;
  provider?: string;
}

export interface DecodedSession extends SessionPayload {
  iat: number;
  exp: number;
}

/**
 * Sign a JWT session token
 * Token includes user ID, email, and optional provider
 */
export function signSession(payload: SessionPayload): string {
  const token = jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      provider: payload.provider,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: 'playlist-manager',
      audience: 'playlist-manager-api',
    }
  );

  return token;
}

/**
 * Verify and decode a JWT session token
 * Returns null if invalid or expired
 */
export function verifySession(token: string): DecodedSession | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'playlist-manager',
      audience: 'playlist-manager-api',
    }) as DecodedSession;

    return decoded;
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
}

/**
 * Extract bearer token from Authorization header
 * Returns null if header is missing or malformed
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  return match[1];
}

/**
 * Verify session from Authorization header
 * Returns decoded session or null if invalid
 */
export function verifySessionFromHeader(authHeader: string | undefined): DecodedSession | null {
  const token = extractBearerToken(authHeader);
  if (!token) {
    return null;
  }

  return verifySession(token);
}
