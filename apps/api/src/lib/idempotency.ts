import { IDEMPOTENCY_TTL_SECONDS } from '../config/env';
import { problem } from './problem';

type Entry = { fingerprint: string; jobId: number; expiresAt: number };
type FingerprintInput = { method: string; path: string; body: unknown };
type RequestHeaders = Record<string, unknown>;

export type RequestWithIdempotency = {
  headers?: RequestHeaders;
  getIdempotencyKey?: () => string | null | undefined;
};

const STORE = new Map<string, Entry>();
const TTL_MS = IDEMPOTENCY_TTL_SECONDS * 1000;

function now() {
  return Date.now();
}

function sweepExpired() {
  const cutoff = now();
  for (const [key, entry] of STORE) {
    if (entry.expiresAt < cutoff) {
      STORE.delete(key);
    }
  }
}

export function remember(key: string, fingerprint: string, jobId: number) {
  sweepExpired();
  STORE.set(key, { fingerprint, jobId, expiresAt: now() + TTL_MS });
}

export function lookup(key: string): Entry | undefined {
  sweepExpired();
  return STORE.get(key);
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

export function reuseJobIdIfPresent(key: string | null, fingerprint: string): number | null {
  if (!key) {
    return null;
  }

  const entry = lookup(key);
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

export function storeJobForKey(key: string | null, fingerprint: string, jobId: number): void {
  if (!key) {
    return;
  }
  remember(key, fingerprint, jobId);
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
