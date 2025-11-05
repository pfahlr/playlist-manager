import fp from 'fastify-plugin';
import client from 'prom-client';

export default fp(async (app) => {
  client.collectDefaultMetrics();
  const httpReqs = new client.Counter({ name: 'http_requests_total', help: 'count', labelNames: ['route','status'] });

  app.addHook('onResponse', (req, reply, done) => {
    httpReqs.inc({ route: req.routerPath ?? req.url, status: String(reply.statusCode) });
    done();
  });

  app.get('/metrics', async (_req, reply) => {
    reply.type('text/plain');
    return await client.register.metrics();
  });
});
