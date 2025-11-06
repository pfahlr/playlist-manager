import { FastifyInstance } from 'fastify';
import { getEnabledProviders } from '../config/flags';

export default async function authProviders(app: FastifyInstance) {
  app.get('/auth/providers', async () => {
    const data = getEnabledProviders().map((name) => ({ name }));
    return { data };
  });
}
