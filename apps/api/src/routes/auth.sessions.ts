import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  refreshAccessToken,
  revokeSession,
  revokeAllUserSessions,
  listUserSessions,
} from '../lib/auth/sessions';

const RefreshSchema = z.object({
  refresh_token: z.string(),
});

const RevokeSessionSchema = z.object({
  session_id: z.string(),
});

/**
 * Session lifecycle management endpoints
 * POST /auth/refresh - Refresh access token
 * POST /auth/logout - Revoke current or specific session
 * POST /auth/logout/all - Revoke all user sessions
 * GET /me/sessions - List user's active sessions
 */
const authSessionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   * Implements token rotation for security
   */
  fastify.post('/auth/refresh', {
    handler: async (request, reply) => {
      const body = RefreshSchema.parse(request.body);

      const result = await refreshAccessToken(body.refresh_token);

      if (!result.success) {
        return reply.status(401).send({
          type: 'about:blank',
          code: 'invalid_refresh_token',
          message: result.error || 'Invalid or expired refresh token',
          details: { request_id: request.id },
        });
      }

      return reply.status(200).send({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: 604800, // 7 days in seconds (JWT_EXPIRES_IN default)
      });
    },
  });

  /**
   * POST /auth/logout
   * Revoke a specific session or current session
   */
  fastify.post('/auth/logout', {
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      // Parse optional session_id from body
      let sessionId: string | undefined;
      try {
        const body = RevokeSessionSchema.parse(request.body);
        sessionId = body.session_id;
      } catch {
        // No session_id provided - this is fine for logging out current session
        // In production, you'd track session_id in JWT claims or request context
        // For now, we'll revoke all sessions as a fallback
      }

      if (sessionId) {
        const revoked = await revokeSession(sessionId);
        if (!revoked) {
          return reply.status(404).send({
            type: 'about:blank',
            code: 'session_not_found',
            message: 'Session not found or already revoked',
            details: { request_id: request.id },
          });
        }
      } else {
        // No session_id provided - revoke all sessions for the user
        // In production, you'd store session_id in JWT or request context
        await revokeAllUserSessions(request.user!.userId);
      }

      return reply.status(204).send();
    },
  });

  /**
   * POST /auth/logout/all
   * Revoke all sessions for the authenticated user
   */
  fastify.post('/auth/logout/all', {
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const count = await revokeAllUserSessions(request.user!.userId);

      return reply.status(200).send({
        message: 'All sessions revoked',
        sessions_revoked: count,
      });
    },
  });

  /**
   * GET /me/sessions
   * List all active sessions for the authenticated user
   */
  fastify.get('/me/sessions', {
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      const sessions = await listUserSessions(request.user!.userId);

      return reply.status(200).send({
        sessions: sessions.map((session) => ({
          session_id: session.id,
          device_info: session.device_info,
          ip_address: session.ip_address,
          created_at: session.created_at.toISOString(),
          last_used_at: session.last_used_at.toISOString(),
          expires_at: session.expires_at.toISOString(),
        })),
      });
    },
  });
};

export default authSessionRoutes;
