import fp from 'fastify-plugin';
import pino from 'pino';

export default fp(async (app) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  app.decorate('logger2', logger);
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).start = Date.now();
    done();
  });
  app.addHook('onResponse', (req, reply, done) => {
    const ms = Date.now() - ((req as any).start || Date.now());
    app.log.info({ path: req.url, status: reply.statusCode, ms }, 'http');
    done();
  });
});

declare module 'fastify' {
  interface FastifyInstance { logger2: pino.Logger; }
}
