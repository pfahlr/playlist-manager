import { FastifyInstance } from 'fastify';
import path from 'node:path';

export default async function docsRoutes(app: FastifyInstance) {
  // Serve raw spec at /openapi.yaml
  app.get('/openapi.yaml', async (_req, reply) => {
    reply.type('text/yaml');
    return reply.sendFile('openapi.yaml', path.resolve(process.cwd()));
  });

  // Serve UI at /docs
  app.get('/docs', async (_req, reply) => {
    reply.type('text/html');
    return reply.sendFile('docs/index.html');
  });
}
