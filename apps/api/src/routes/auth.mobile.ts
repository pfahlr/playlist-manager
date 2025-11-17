import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createAttempt, lookupAttempt } from '../lib/auth/attempts';
import { buildSpotifyAuthUrl } from '../lib/auth/providers/spotify';
import { isProviderEnabled } from '../config/env';

const AuthorizeMobileSchema = z.object({
  provider: z.enum(['spotify', 'deezer', 'tidal', 'youtube']),
  code_challenge: z.string().min(43).max(128),
  redirect_uri: z.string().url(),
});

const authMobileRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/mobile/authorize
   * Initiate mobile OAuth PKCE flow
   */
  fastify.post('/auth/mobile/authorize', {
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'code_challenge', 'redirect_uri'],
        properties: {
          provider: { type: 'string', enum: ['spotify', 'deezer', 'tidal', 'youtube'] },
          code_challenge: { type: 'string', minLength: 43, maxLength: 128 },
          redirect_uri: { type: 'string', format: 'uri' },
        },
      },
      response: {
        201: {
          type: 'object',
          required: ['attempt_id', 'authorization_url', 'expires_at'],
          properties: {
            attempt_id: { type: 'string' },
            authorization_url: { type: 'string', format: 'uri' },
            expires_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      // Validate request body
      const body = AuthorizeMobileSchema.parse(request.body);

      // Check if provider is enabled
      if (!isProviderEnabled(body.provider)) {
        return reply.status(400).send({
          type: 'about:blank',
          code: 'provider_disabled',
          message: `${body.provider} is not enabled`,
          details: { request_id: request.id },
        });
      }

      // Create OAuth attempt
      const attempt = await createAttempt({
        provider: body.provider,
        codeChallenge: body.code_challenge,
        redirectUri: body.redirect_uri,
        expiresInMinutes: 10,
      });

      // Build authorization URL based on provider
      let authorizationUrl: string;

      switch (body.provider) {
        case 'spotify':
          authorizationUrl = buildSpotifyAuthUrl({
            codeChallenge: body.code_challenge,
            state: attempt.state!,
            redirectUri: body.redirect_uri,
          });
          break;

        case 'deezer':
        case 'tidal':
        case 'youtube':
          // TODO: Implement other providers
          return reply.status(503).send({
            type: 'about:blank',
            code: 'provider_not_implemented',
            message: `${body.provider} OAuth not yet implemented`,
            details: { request_id: request.id },
          });

        default:
          return reply.status(400).send({
            type: 'about:blank',
            code: 'unknown_provider',
            message: 'Unknown provider',
            details: { request_id: request.id },
          });
      }

      return reply.status(201).send({
        attempt_id: attempt.id,
        authorization_url: authorizationUrl,
        expires_at: attempt.expiresAt.toISOString(),
      });
    },
  });

  /**
   * GET /auth/mobile/attempts/:id
   * Check OAuth attempt status (polling endpoint)
   */
  fastify.get('/auth/mobile/attempts/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          required: ['attempt_id', 'status', 'created_at'],
          properties: {
            attempt_id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'succeeded', 'failed', 'expired'] },
            access_token: { type: ['string', 'null'] },
            refresh_token: { type: ['string', 'null'] },
            expires_in: { type: ['integer', 'null'] },
            error: { type: ['string', 'null'] },
            error_description: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: ['string', 'null'], format: 'date-time' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      // Look up attempt
      const attempt = await lookupAttempt(id);

      if (!attempt) {
        return reply.status(404).send({
          type: 'about:blank',
          code: 'attempt_not_found',
          message: 'OAuth attempt not found',
          details: { request_id: request.id },
        });
      }

      return reply.send({
        attempt_id: attempt.id,
        status: attempt.status,
        access_token: attempt.accessToken,
        refresh_token: attempt.refreshToken,
        expires_in: attempt.expiresIn,
        error: attempt.error,
        error_description: attempt.errorDescription,
        created_at: attempt.createdAt.toISOString(),
        updated_at: attempt.updatedAt ? attempt.updatedAt.toISOString() : null,
      });
    },
  });
};

export default authMobileRoutes;
