import { FastifyInstance } from 'fastify';
import { flags } from '../config/flags';

export default async function authProviders(app: FastifyInstance) {
  app.get('/auth/providers', async () => {
    const data = Object.entries(flags.providers).map(([name, enabled]) => ({ name, enabled }));
    return { data };
  });
}
