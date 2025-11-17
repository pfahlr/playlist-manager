import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env';

/**
 * Rate Limiting Plugin
 * Protects against abuse on sensitive endpoints
 */
const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  // Global rate limit (fallback for all routes)
  await fastify.register(rateLimit, {
    max: 100, // 100 requests
    timeWindow: '1 minute',
    cache: 10000, // Track up to 10k IPs
    allowList: ['127.0.0.1', '::1'], // Allow localhost in development
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    errorResponseBuilder: (request, context) => {
      return {
        type: 'about:blank',
        code: 'rate_limited',
        message: 'Too many requests',
        details: {
          request_id: request.id,
          limit: context.max,
          window: context.after,
          retry_after: context.ttl,
        },
      };
    },
  });

  // Stricter rate limit for auth endpoints
  fastify.addHook('onRoute', (routeOptions) => {
    const path = routeOptions.url;

    // Apply stricter limits to auth endpoints
    if (path.startsWith('/auth/')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: 10, // 10 requests
          timeWindow: '1 minute',
        },
      };
    }

    // Apply stricter limits to job creation endpoints
    if (path.startsWith('/jobs/migrate') || path.startsWith('/exports/file')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: 5, // 5 requests
          timeWindow: '1 minute',
        },
      };
    }
  });

  fastify.log.info('Rate limiting configured');
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '5.x',
});
