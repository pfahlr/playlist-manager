import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';

import { isProviderEnabled, ProviderFlagName } from '../config/flags';
import { problem } from '../lib/problem';

export default fp(async (app) => {
  app.decorate('requireProvider', (name: ProviderFlagName) => {
    if (!isProviderEnabled(name)) {
      throw problem({
        status: 503,
        code: 'provider_disabled',
        message: `${name} provider is disabled`,
      });
    }
  });

  app.decorateRequest(
    'requireProvider',
    function (this: FastifyRequest, name: ProviderFlagName) {
      app.requireProvider(name);
    },
  );
});

declare module 'fastify' {
  interface FastifyInstance {
    requireProvider(name: ProviderFlagName): void;
  }

  interface FastifyRequest {
    requireProvider(name: ProviderFlagName): void;
  }
}
