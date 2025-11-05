import fp from 'fastify-plugin';
import { isProviderEnabled, ProviderFlagName } from '../config/flags';

export default fp(async (app) => {
  app.decorate('requireProvider', (name: ProviderFlagName) => {
    if (!isProviderEnabled(name)) {
      const err: any = new Error(`${name} is disabled`);
      err.statusCode = 503;
      err.code = 'provider_disabled';
      throw err;
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    requireProvider(name: ProviderFlagName): void;
  }
}
