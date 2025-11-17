import fp from 'fastify-plugin';
import pino from 'pino';
import { randomUUID } from 'crypto';

/**
 * Extract or generate request ID from headers
 */
function getRequestId(headers: Record<string, string | string[] | undefined>): string {
  const headerValue = headers['x-request-id'] || headers['x-correlation-id'];

  if (typeof headerValue === 'string') {
    return headerValue;
  }

  if (Array.isArray(headerValue) && headerValue.length > 0) {
    return headerValue[0];
  }

  return randomUUID();
}

export default fp(async (app) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  app.decorate('logger2', logger);

  // Add request-id and timing to all requests
  app.addHook('onRequest', (req, reply, done) => {
    const requestId = getRequestId(req.headers as Record<string, string | string[] | undefined>);

    // Store request-id and start time
    (req as any).start = Date.now();
    (req as any).requestId = requestId;

    // Add to response headers for client correlation
    reply.header('X-Request-ID', requestId);

    // Log incoming request with requestId
    app.log.info({
      requestId,
      method: req.method,
      path: req.url,
      remoteAddress: req.ip,
    }, 'incoming request');

    done();
  });

  // Log response with timing and requestId
  app.addHook('onResponse', (req, reply, done) => {
    const ms = Date.now() - ((req as any).start || Date.now());
    const requestId = (req as any).requestId;

    app.log.info({
      requestId,
      path: req.url,
      status: reply.statusCode,
      responseTime: ms,
    }, 'request completed');

    done();
  });

  // Enhanced error handler with correlation
  app.setErrorHandler((error, request, reply) => {
    const requestId = (request as any).requestId;

    // Log error with full context including requestId and error.code
    app.log.error({
      requestId,
      error: {
        message: error.message,
        code: (error as any).code || 'UNKNOWN_ERROR',
        stack: error.stack,
        statusCode: (error as any).statusCode || 500,
      },
      method: request.method,
      path: request.url,
    }, 'request error');

    // Send error response with requestId
    const statusCode = (error as any).statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: error.message,
        code: (error as any).code || 'INTERNAL_ERROR',
        requestId,
      },
    });
  });
});

declare module 'fastify' {
  interface FastifyInstance { logger2: pino.Logger; }
}
