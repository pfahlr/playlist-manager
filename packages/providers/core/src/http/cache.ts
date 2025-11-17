import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import { createHash } from 'crypto';

/**
 * Cache backend interface for HTTP responses.
 * Supports both in-memory (LRU) and Redis backends.
 */
export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Cache metrics for observability.
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
}

/**
 * In-memory LRU cache backend using lru-cache package.
 */
export class InMemoryCache implements CacheBackend {
  private cache: LRUCache<string, string>;
  private metrics: CacheMetrics = { hits: 0, misses: 0, evictions: 0 };

  constructor(options: { maxSize?: number; defaultTtlMs?: number } = {}) {
    const { maxSize = 1000, defaultTtlMs = 60000 } = options;

    this.cache = new LRUCache({
      max: maxSize,
      ttl: defaultTtlMs,
      dispose: () => {
        this.metrics.evictions++;
      },
    });
  }

  async get(key: string): Promise<string | null> {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.metrics.hits++;
      return value;
    }
    this.metrics.misses++;
    return null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.cache.set(key, value, { ttl: ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = { hits: 0, misses: 0, evictions: 0 };
  }
}

/**
 * Redis cache backend for distributed caching.
 */
export class RedisCache implements CacheBackend {
  private client: Redis;
  private metrics: CacheMetrics = { hits: 0, misses: 0, evictions: 0 };

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async get(key: string): Promise<string | null> {
    const value = await this.client.get(key);
    if (value !== null) {
      this.metrics.hits++;
      return value;
    }
    this.metrics.misses++;
    return null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    // Redis PSETEX takes ttl in milliseconds
    await this.client.psetex(key, ttlMs, value);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    // Warning: This clears ALL keys in the Redis database
    await this.client.flushdb();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = { hits: 0, misses: 0, evictions: 0 };
  }
}

/**
 * Compute cache key from HTTP request parameters.
 * Format: hash(method + url + auth.userId)
 */
export function computeCacheKey(
  method: string,
  url: string,
  userId?: string | number
): string {
  const parts = [method.toUpperCase(), url];
  if (userId !== undefined) {
    parts.push(String(userId));
  }

  const combined = parts.join('::');
  const hash = createHash('sha256').update(combined).digest('hex');
  return `http:${hash}`;
}

/**
 * Check if response should be cached.
 * Only cache GET requests with 2xx responses.
 */
export function shouldCache(method: string, statusCode: number): boolean {
  return method.toUpperCase() === 'GET' && statusCode >= 200 && statusCode < 300;
}

/**
 * Parse cached response value.
 */
export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
}

export function serializeCachedResponse(response: CachedResponse): string {
  return JSON.stringify(response);
}

export function deserializeCachedResponse(value: string): CachedResponse {
  return JSON.parse(value);
}
