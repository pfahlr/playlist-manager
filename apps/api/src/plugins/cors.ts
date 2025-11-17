import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { getCorsOrigins } from '../config/env';

/**
 * CORS Plugin
 * Configured from CORS_ORIGINS environment variable
 */
const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const allowedOrigins = getCorsOrigins();

  fastify.log.info({ origins: allowedOrigins }, 'Configuring CORS');

  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['ETag', 'Location'],
    maxAge: 86400, // 24 hours
  });
};

export default fp(corsPlugin, {
  name: 'cors',
  fastify: '5.x',
});
