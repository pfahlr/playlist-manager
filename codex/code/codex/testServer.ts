import type { IncomingHttpHeaders } from 'node:http';
import { toProblemBody, problem } from '../../../apps/api/src/lib/problem';
import type { ProviderFlagName } from '../../../apps/api/src/config/flags';
import { flags, isProviderEnabled } from '../../../apps/api/src/config/flags';

type HandlerResult = {
  status: number;
  headers: Record<string, string>;
  text: string;
  body: unknown;
};

type HandlerTarget = {
  handle(
    method: string,
    path: string,
    options: { headers: Record<string, string>; body?: unknown },
  ): Promise<HandlerResult>;
};

const migrateRoutePromise = import('../../../apps/api/src/routes/jobs/migrate.post');

export async function makeServer(): Promise<HandlerTarget> {
  enableAllProviders();
  const [{ default: migrateHandler }] = await Promise.all([migrateRoutePromise]);

  return {
    async handle(method, path, options) {
      const normalizedPath = normalizePath(path);
      if (method !== 'POST' || normalizedPath !== '/jobs/migrate') {
        return notFound();
      }

      const reply = createReply();
      const request = createRequest(options.headers, options.body);

      try {
        await migrateHandler(request as any, reply as any);
        return reply.done();
      } catch (error) {
        return formatError(error);
      }
    },
  };
}

function enableAllProviders() {
  (Object.keys(flags.providers) as ProviderFlagName[]).forEach((name) => {
    flags.providers[name] = true;
  });
}

function createRequest(headers: IncomingHttpHeaders, body: unknown) {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    normalizedHeaders[key.toLowerCase()] = value;
  }

  return {
    headers: normalizedHeaders,
    body,
    requireProvider(name: ProviderFlagName) {
      if (!isProviderEnabled(name)) {
        throw problem({
          status: 503,
          code: 'provider_disabled',
          message: `${name} provider is disabled`,
        });
      }
    },
  };
}

function createReply() {
  let statusCode = 200;
  const headers = new Map<string, string>();
  let payload: unknown;

  const reply = {
    status(code: number) {
      statusCode = code;
      return reply;
    },
    code(code: number) {
      return reply.status(code);
    },
    header(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return reply;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    async send(body: unknown) {
      payload = body;
      if (!headers.has('content-type')) {
        headers.set('content-type', inferContentType(body));
      }
      return reply;
    },
    done(): HandlerResult {
      const headerRecord = Object.fromEntries(headers.entries());
      const text =
        payload === undefined || payload === null
          ? ''
          : typeof payload === 'string'
            ? payload
            : JSON.stringify(payload);
      return {
        status: statusCode,
        headers: headerRecord,
        text,
        body: payload,
      };
    },
  };

  return reply;
}

function formatError(error: unknown): HandlerResult {
  const err = error as any;
  const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
  const code = typeof err?.code === 'string' ? err.code : 'internal';
  const message =
    typeof err?.message === 'string' && err.message.length > 0
      ? err.message
      : 'Internal Server Error';
  const body = toProblemBody({
    status,
    code,
    message,
    details: (err?.details as Record<string, unknown> | undefined) ?? null,
  });
  const text = JSON.stringify(body);
  return {
    status,
    headers: { 'content-type': 'application/json' },
    text,
    body,
  };
}

function notFound(): HandlerResult {
  const body = toProblemBody({
    status: 404,
    code: 'not_found',
    message: 'Route not found',
    details: null,
  });
  return {
    status: 404,
    headers: { 'content-type': 'application/json' },
    text: JSON.stringify(body),
    body,
  };
}

function inferContentType(body: unknown): string {
  if (typeof body === 'string') return 'text/plain; charset=utf-8';
  return 'application/json';
}

function normalizePath(path: string): string {
  const url = new URL(path, 'http://tests');
  const pathname = url.pathname.startsWith('/api/v1')
    ? url.pathname.slice('/api/v1'.length) || '/'
    : url.pathname;
  return pathname;
}
