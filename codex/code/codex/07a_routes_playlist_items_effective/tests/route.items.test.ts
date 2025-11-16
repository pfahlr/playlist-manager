import { URL } from 'node:url';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { toProblemBody } from '../../../../../apps/api/src/lib/problem';
import { createResponseValidationHook } from '../../../../../apps/api/src/lib/openapi/validator';
import handler from '../../../../../apps/api/src/routes/playlists/[id]/items.get';

type EffectivePlaylistItem = {
  id: number;
  position: number | null;
  title: string;
  artists: string;
  album: string | null;
  duration_ms: number | null;
  recording_id: number | null;
  isrc: string | null;
  mb_recording_id: string | null;
  mb_release_id: string | null;
  provider_track_id: string | null;
};

type FetchResult = {
  etag: string;
  nextCursor: string | null;
  items: EffectivePlaylistItem[];
};

type TestServer = {
  handle(
    method: string,
    path: string,
    options: { headers: Record<string, string>; body?: unknown },
  ): Promise<{ status: number; headers: Record<string, string>; text: string; body: unknown }>;
};

const fetchEffectivePlaylistItems = vi.hoisted(() =>
  vi.fn<[_args: any], Promise<FetchResult>>(),
);

vi.mock('../../../../../apps/api/src/lib/db/effectiveItems.ts', () => ({
  fetchEffectivePlaylistItems,
}));

async function startServer(): Promise<TestServer> {
  const validator = await createResponseValidationHook();
  return {
    async handle(method, path, options) {
      const url = new URL(path, 'http://test');
      if (method !== 'GET' || !/^\/playlists\/\d+\/items$/.test(url.pathname)) {
        const body = toProblemBody({ status: 404, code: 'not_found', message: 'Route not found', details: null, requestId: null });
        return asResponse(404, body, { 'content-type': 'application/json' });
      }

      const auth = options.headers['authorization'];
      if (auth !== 'Bearer test-token') {
        const body = toProblemBody({ status: 401, code: 'unauthorized', message: 'Invalid or missing Authorization header', details: null, requestId: null });
        return asResponse(401, body, { 'content-type': 'application/json' });
      }

      const [, , playlistId] = url.pathname.split('/');
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      const headers = new Map<string, string>();
      let payloadToSend: unknown = null;
      const replyLike = {
        statusCode: 200,
        header(name: string, value: string) {
          headers.set(name.toLowerCase(), value);
          return replyLike;
        },
        status(code: number) {
          replyLike.statusCode = code;
          return replyLike;
        },
        getHeader(name: string) {
          return headers.get(name.toLowerCase());
        },
        async send(payload: unknown) {
          payloadToSend = payload;
          await validator(
            { method, routeOptions: { url: '/playlists/:id/items' } } as any,
            { statusCode: replyLike.statusCode, getHeader: (name: string) => headers.get(name.toLowerCase()) } as any,
            payload,
          );
          if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }
        },
      };

      const requestLike: any = {
        method,
        params: { id: playlistId },
        query,
        headers: options.headers,
      };

      try {
        await handler(requestLike, replyLike as any);
        return asResponse(replyLike.statusCode, payloadToSend, Object.fromEntries(headers.entries()));
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

function asResponse(status: number, body: unknown, headers: Record<string, string>) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers, text, body };
}

async function stopServer(_server?: TestServer) {
  return;
}

describe('GET /playlists/:id/items?effective=true', () => {
  let server: TestServer | undefined;

  beforeEach(() => {
    fetchEffectivePlaylistItems.mockReset();
  });

  afterEach(async () => {
    await stopServer(server);
    server = undefined;
  });

  test('invalid shape fails validation', async () => {
    fetchEffectivePlaylistItems.mockResolvedValue({
      etag: 'W/"demo"',
      nextCursor: null,
      items: [
        {
          id: 9001,
          position: 1,
          title: 'Broken Entry',
          artists: null as any,
          album: null,
          duration_ms: null,
          recording_id: null,
          isrc: null,
          mb_recording_id: null,
          mb_release_id: null,
          provider_track_id: null,
        },
      ],
    } as FetchResult);

    server = await startServer();

    const response = await request(server)
      .get('/playlists/9/items?effective=true')
      .set('Authorization', 'Bearer test-token');

    expect(fetchEffectivePlaylistItems).toHaveBeenCalledWith({
      playlistId: 9,
      limit: 100,
      cursor: null,
      order: 'position',
    });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('contract_validation_failed');
  });

  test('returns effective playlist items with pagination metadata', async () => {
    const items: EffectivePlaylistItem[] = [
      {
        id: 4001,
        position: 1,
        title: 'Losing My Religion',
        artists: 'R.E.M.',
        album: 'Out of Time',
        duration_ms: 269000,
        recording_id: 5551,
        isrc: 'USWB19902945',
        mb_recording_id: 'b8d0d7c0-8e1c-4b34-8bc3-38d78a0c2b1f',
        mb_release_id: 'b7a6d2e4-1c77-4a9f-9d5b-0c3b2ea0f4a1',
        provider_track_id: '3urbQpVxWn',
      },
      {
        id: 4002,
        position: 2,
        title: 'Hurt',
        artists: 'Nine Inch Nails',
        album: 'The Downward Spiral',
        duration_ms: 371000,
        recording_id: 5552,
        isrc: 'USIR19400383',
        mb_recording_id: 'f2d9f7d3-7a61-485f-9b1e-2f4d8b3b7d1a',
        mb_release_id: '9c0b3c90-1e37-4b9b-8c7e-9b7a86a1e5fd',
        provider_track_id: '9zYpqAbC12',
      },
    ];

    fetchEffectivePlaylistItems.mockResolvedValue({
      etag: 'W/"pl-101::4002"',
      nextCursor: '4002',
      items,
    } as FetchResult);

    server = await startServer();

    const response = await request(server)
      .get('/playlists/101/items?effective=true&cursor=3999&limit=2&order=position')
      .set('Authorization', 'Bearer test-token');

    expect(fetchEffectivePlaylistItems).toHaveBeenCalledWith({
      playlistId: 101,
      cursor: 3999,
      limit: 2,
      order: 'position',
    });

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('W/"pl-101::4002"');
    expect(response.body).toEqual({ data: items, next_cursor: '4002' });
  });
});
