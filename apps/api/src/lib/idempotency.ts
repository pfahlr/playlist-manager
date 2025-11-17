import { env } from '../config/env';
import { problem } from './problem';
import { createIdempotencyStore, type IdempotencyStore, type IdempotencyEntry } from './idempotencyStore';
import { getRedisClient, checkRedisHealth } from './redis/client';

type FingerprintInput = { method: string; path: string; body: unknown };
type RequestHeaders = Record<string, unknown>;

export type RequestWithIdempotency = {
  headers?: RequestHeaders;
  getIdempotencyKey?: () => string | null | undefined;
};

// Global store instance (initialized on first use)
let storeInstance: IdempotencyStore | null = null;

/**
 * Get or initialize the idempotency store
 */
function getStore(): IdempotencyStore {
  if (!storeInstance) {
    const backend = env.IDEMPOTENCY_STORE_BACKEND;
    const isDevelopment = env.NODE_ENV === 'development';

    if (backend === 'redis' && env.REDIS_URL) {
      try {
        const redisClient = getRedisClient({ url: env.REDIS_URL });
        storeInstance = createIdempotencyStore({
          backend: 'redis',
          redisClient,
          isDevelopment,
        });
      } catch (error) {
        console.error('[Idempotency] Failed to initialize Redis store:', error);
        if (!isDevelopment) {
          throw new Error('Failed to initialize Redis idempotency store in production');
        }
        console.warn('[Idempotency] Falling back to in-memory store');
        storeInstance = createIdempotencyStore({ backend: 'memory', isDevelopment });
      }
    } else {
      storeInstance = createIdempotencyStore({ backend: 'memory', isDevelopment });
    }
  }

  return storeInstance;
}

export async function remember(key: string, fingerprint: string, jobId: number): Promise<void> {
  const store = getStore();
  const entry: IdempotencyEntry = {
    fingerprint,
    jobId,
    createdAt: Date.now(),
  };
  await store.set(key, entry, env.IDEMPOTENCY_TTL_SECONDS);
}

export async function lookup(key: string): Promise<IdempotencyEntry | null> {
  const store = getStore();
  return store.get(key);
}

/**
 * Check idempotency store health (for API startup checks)
 */
export async function checkIdempotencyStoreHealth(): Promise<boolean> {
  const backend = env.IDEMPOTENCY_STORE_BACKEND;

  if (backend === 'redis' && env.REDIS_URL) {
    try {
      const redisClient = getRedisClient({ url: env.REDIS_URL });
      return await checkRedisHealth(redisClient);
    } catch (error) {
      console.error('[Idempotency] Health check failed:', error);
      return false;
    }
  }

  // In-memory store is always healthy
  return true;
}

export function fingerprintRequest(input: FingerprintInput): string {
  const method = (input.method ?? '').toUpperCase();
  const path = input.path ?? '';
  const normalizedBody = normalizeJson(input.body ?? null);
  return `${method} ${path} ${JSON.stringify(normalizedBody)}`;
}

export function normalizeIdempotencyKey(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveRequestIdempotencyKey(request: RequestWithIdempotency): string | null {
  if (typeof request.getIdempotencyKey === 'function') {
    const decorated = request.getIdempotencyKey();
    if (typeof decorated === 'string' && decorated.length > 0) {
      return decorated;
    }
  }

  const raw = getHeaderValue(request.headers, 'idempotency-key');
  return normalizeIdempotencyKey(raw);
}

export async function reuseJobIdIfPresent(key: string | null, fingerprint: string): Promise<number | null> {
  if (!key) {
    return null;
  }

  const entry = await lookup(key);
  if (!entry) {
    return null;
  }

  if (entry.fingerprint !== fingerprint) {
    throw problem({
      status: 422,
      code: 'idempotency_conflict',
      message: 'Idempotency fingerprint mismatch',
      details: { idempotency_key: key },
    });
  }

  return entry.jobId;
}

export async function storeJobForKey(key: string | null, fingerprint: string, jobId: number): Promise<void> {
  if (!key) {
    return;
  }
  await remember(key, fingerprint, jobId);
}

function getHeaderValue(headers: RequestHeaders | undefined, name: string): string | string[] | undefined {
  if (!headers) {
    return undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      if (typeof value === 'string' || Array.isArray(value)) {
        return value;
      }
      return undefined;
    }
  }

  return undefined;
}

function normalizeJson(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      normalized[key] = normalizeJson(child);
    }
    return normalized;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}
