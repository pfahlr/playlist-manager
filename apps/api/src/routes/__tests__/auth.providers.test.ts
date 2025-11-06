import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('fastify-plugin', () => ({
  default: (fn: any) => fn,
  __esModule: true,
}));

type RequestDecoratorMap = Record<string, (...args: any[]) => unknown>;

function resetProviderEnv() {
  delete process.env.PROVIDERS_SPOTIFY_ENABLED;
  delete process.env.PROVIDERS_DEEZER_ENABLED;
  delete process.env.PROVIDERS_TIDAL_ENABLED;
  delete process.env.PROVIDERS_YOUTUBE_ENABLED;
}

function createStubApp() {
  const requestDecorators: RequestDecoratorMap = {};

  const app: any = {
    requestDecorators,
    decorators: {} as Record<string, any>,
    decorate(name: string, value: unknown) {
      this.decorators[name] = value;
      this[name] = value;
      return this;
    },
    decorateRequest(name: string, value: (...args: any[]) => unknown) {
      requestDecorators[name] = value;
      return this;
    },
    addHook: vi.fn(),
    setNotFoundHandler(handler: unknown) {
      this.notFoundHandler = handler;
      return this;
    },
    setErrorHandler(handler: any) {
      this.errorHandler = handler;
      return this;
    },
    log: {
      warn: vi.fn(),
    },
  };

  return app;
}

function createRequest(app: any, requestDecorators: RequestDecoratorMap, body: Record<string, unknown>) {
  const request: any = {
    body,
    headers: {},
    server: app,
  };

  for (const [name, fn] of Object.entries(requestDecorators)) {
    request[name] = function (...args: any[]) {
      return fn.apply(request, args);
    };
  }

  return request;
}

describe('GET /auth/providers', () => {
  afterEach(() => {
    resetProviderEnv();
  });

  it('omits providers that are disabled via flags', async () => {
    vi.resetModules();
    process.env.PROVIDERS_SPOTIFY_ENABLED = 'false';
    process.env.PROVIDERS_DEEZER_ENABLED = 'true';

    const authProviders = (await import('../auth.providers')).default;

    const get = vi.fn();
    await authProviders({ get } as any);

    const [, handler] = get.mock.calls.at(0)!;
    const payload = await handler();

    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.find((provider: any) => provider.name === 'spotify')).toBeUndefined();
    const deezer = payload.data.find((provider: any) => provider.name === 'deezer');
    expect(deezer).toBeDefined();
  });
});

describe('feature guard middleware', () => {
  afterEach(() => {
    resetProviderEnv();
  });

  it('blocks provider-dependent routes when a provider is disabled', async () => {
    vi.resetModules();
    process.env.PROVIDERS_SPOTIFY_ENABLED = 'false';
    process.env.PROVIDERS_DEEZER_ENABLED = 'true';

    const errorsPlugin = (await import('../../plugins/errors')).default;
    const featureGuard = (await import('../../plugins/feature-guard')).default;
    const migrateHandler = (await import('../jobs/migrate.post')).default;

    const app = createStubApp();
    await errorsPlugin(app);
    await featureGuard(app);

    const request = createRequest(app, app.requestDecorators, {
      source_provider: 'spotify',
      source_playlist_id: 123,
      dest_provider: 'deezer',
      dest_playlist_name: 'Flagged migrate',
    });

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    let caught: any;
    try {
      await migrateHandler(request, reply as any);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(caught).toMatchObject({
      statusCode: 503,
      code: 'provider_disabled',
    });

    await app.errorHandler(caught, request, reply as any);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledTimes(1);
    const [body] = reply.send.mock.calls[0];
    expect(body).toMatchObject({
      type: 'about:blank',
      code: 'provider_disabled',
    });
    expect(body.message).toMatch(/spotify/i);
  });
});
