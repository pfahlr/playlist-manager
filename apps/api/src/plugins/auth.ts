import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifySessionFromHeader, DecodedSession } from '../lib/auth/session';

// Extend Fastify Request type to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: DecodedSession;
  }
}

/**
 * JWT Authentication Plugin
 * Verifies bearer tokens and attaches user to request
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorator to require authentication on routes
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.status(401).send({
        type: 'about:blank',
        code: 'unauthorized',
        message: 'Missing Authorization header',
        details: { request_id: request.id },
      });
    }

    const session = verifySessionFromHeader(authHeader);

    if (!session) {
      return reply.status(401).send({
        type: 'about:blank',
        code: 'unauthorized',
        message: 'Invalid or expired token',
        details: { request_id: request.id },
      });
    }

    // Attach user to request
    request.user = session;
  });

  // Optional authentication (sets user if token present, but doesn't reject if missing)
  fastify.decorate('optionalAuth', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;

    if (authHeader) {
      const session = verifySessionFromHeader(authHeader);
      if (session) {
        request.user = session;
      }
    }
  });
};

export default fp(authPlugin, {
  name: 'auth',
  fastify: '5.x',
});
