import { beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';

import handler from '../../../../../apps/api/src/routes/exports/file.post';
import * as Jobs from '../../../../../apps/api/src/lib/jobs/enqueue';
import { toProblemBody } from '../../../../../apps/api/src/lib/problem';

type HandlerResult = {
  status: number;
  headers: Record<string, string>;
  text: string;
  body: unknown;
};

type TestServer = {
  handle(
    method: string,
    path: string,
    options: { headers: Record<string, string>; body?: unknown },
  ): Promise<HandlerResult>;
};

function asResponse(status: number, body: unknown, headers: Record<string, string>): HandlerResult {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers, text, body };
}

function createServer(): TestServer {
  return {
    async handle(method, path, options) {
      if (method !== 'POST' || path !== '/exports/file') {
        const body = toProblemBody({
          status: 404,
          code: 'not_found',
          message: `Route ${method}:${path} not found`,
          requestId: null,
        });
        return asResponse(404, body, { 'content-type': 'application/json' });
      }

      const headers = normalizeHeaders(options.headers);
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }

      const auth = headers['authorization'];
      if (auth !== 'Bearer test-token') {
        const body = toProblemBody({
          status: 401,
          code: 'unauthorized',
          message: 'Invalid or missing Authorization header',
          requestId: null,
        });
        return asResponse(401, body, { 'content-type': 'application/json' });
      }

      const replyHeaders = new Map<string, string>();
      let payloadToSend: unknown = null;
      const replyLike = {
        statusCode: 200,
        header(name: string, value: string) {
          replyHeaders.set(name.toLowerCase(), value);
          return replyLike;
        },
        status(code: number) {
          replyLike.statusCode = code;
          return replyLike;
        },
        getHeader(name: string) {
          return replyHeaders.get(name.toLowerCase());
        },
        async send(payload: unknown) {
          payloadToSend = payload;
          if (!replyHeaders.has('content-type')) {
            replyHeaders.set('content-type', 'application/json');
          }
          return payload;
        },
      };

      const requestLike: any = {
        method,
        headers,
        body: options.body,
      };

      try {
        await handler(requestLike, replyLike as any);
        return asResponse(
          replyLike.statusCode,
          payloadToSend,
          Object.fromEntries(replyHeaders.entries()),
        );
      } catch (error) {
        const status = (error as any).statusCode ?? 500;
        const code = (error as any).code ?? 'internal';
        const body = toProblemBody({
          status,
          code,
          message: (error as any).message ?? 'Internal Server Error',
          details: (error as any).details ?? null,
          requestId: null,
        });
        return asResponse(status, body, { 'content-type': 'application/json' });
      }
    },
  };
}

function normalizeHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

describe('POST /exports/file', () => {
  let server: TestServer;

  beforeEach(() => {
    vi.restoreAllMocks();
    server = createServer();
  });

  test('rejects invalid payloads', async () => {
    const spy = vi.spyOn(Jobs, 'enqueue').mockResolvedValue({ id: 111 });

    const response = await request(server)
      .post('/exports/file')
      .set('Authorization', 'Bearer test-token')
      .send({ format: 'csv' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_export_request');
    expect(spy).not.toHaveBeenCalled();
  });

  test('enqueues export job and returns JobRef', async () => {
    const enqueueSpy = vi.spyOn(Jobs, 'enqueue').mockResolvedValue({ id: 7777 });

    const response = await request(server)
      .post('/exports/file')
      .set('Authorization', 'Bearer test-token')
      .send({ playlist_id: 42, format: 'csv', variant: 'lean' });

    expect(enqueueSpy).toHaveBeenCalledWith({
      kind: 'export_file',
      playlist_id: 42,
      format: 'csv',
      variant: 'lean',
    });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ job_id: 7777, status: 'queued' });
  });
});
