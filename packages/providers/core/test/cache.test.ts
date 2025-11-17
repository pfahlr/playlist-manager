import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InMemoryCache,
  RedisCache,
  computeCacheKey,
  shouldCache,
  serializeCachedResponse,
  deserializeCachedResponse,
  type CachedResponse,
} from '../src/http/cache.js';

describe('computeCacheKey', () => {
  it('should generate consistent keys for same inputs', () => {
    const key1 = computeCacheKey('GET', '/api/playlists', '123');
    const key2 = computeCacheKey('GET', '/api/playlists', '123');
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different methods', () => {
    const key1 = computeCacheKey('GET', '/api/playlists', '123');
    const key2 = computeCacheKey('POST', '/api/playlists', '123');
    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different URLs', () => {
    const key1 = computeCacheKey('GET', '/api/playlists', '123');
    const key2 = computeCacheKey('GET', '/api/tracks', '123');
    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different user IDs', () => {
    const key1 = computeCacheKey('GET', '/api/playlists', '123');
    const key2 = computeCacheKey('GET', '/api/playlists', '456');
    expect(key1).not.toBe(key2);
  });

  it('should handle missing user ID', () => {
    const key = computeCacheKey('GET', '/api/playlists');
    expect(key).toMatch(/^http:/);
  });
});

describe('shouldCache', () => {
  it('should cache GET requests with 2xx status', () => {
    expect(shouldCache('GET', 200)).toBe(true);
    expect(shouldCache('GET', 201)).toBe(true);
    expect(shouldCache('GET', 299)).toBe(true);
  });

  it('should not cache non-GET requests', () => {
    expect(shouldCache('POST', 200)).toBe(false);
    expect(shouldCache('PUT', 200)).toBe(false);
    expect(shouldCache('DELETE', 200)).toBe(false);
  });

  it('should not cache non-2xx responses', () => {
    expect(shouldCache('GET', 199)).toBe(false);
    expect(shouldCache('GET', 300)).toBe(false);
    expect(shouldCache('GET', 404)).toBe(false);
    expect(shouldCache('GET', 500)).toBe(false);
  });
});

describe('CachedResponse serialization', () => {
  it('should serialize and deserialize cached response', () => {
    const response: CachedResponse = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { id: 1, name: 'Test' },
    };

    const serialized = serializeCachedResponse(response);
    const deserialized = deserializeCachedResponse(serialized);

    expect(deserialized).toEqual(response);
  });
});

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache({ maxSize: 10, defaultTtlMs: 1000 });
  });

  it('should set and get values', async () => {
    await cache.set('key1', 'value1', 1000);
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it('should return null for missing keys', async () => {
    const value = await cache.get('nonexistent');
    expect(value).toBeNull();
  });

  it('should delete values', async () => {
    await cache.set('key1', 'value1', 1000);
    await cache.delete('key1');
    const value = await cache.get('key1');
    expect(value).toBeNull();
  });

  it('should clear all values', async () => {
    await cache.set('key1', 'value1', 1000);
    await cache.set('key2', 'value2', 1000);
    await cache.clear();
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });

  it('should track cache hits and misses', async () => {
    await cache.set('key1', 'value1', 1000);

    await cache.get('key1'); // hit
    await cache.get('key2'); // miss
    await cache.get('key1'); // hit
    await cache.get('key3'); // miss

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(2);
  });

  it('should reset metrics', async () => {
    await cache.set('key1', 'value1', 1000);
    await cache.get('key1'); // hit

    cache.resetMetrics();

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
  });

  it('should expire entries after TTL', async () => {
    await cache.set('key1', 'value1', 50); // 50ms TTL
    expect(await cache.get('key1')).toBe('value1');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await cache.get('key1')).toBeNull();
  });

  it('should evict entries when max size exceeded', async () => {
    const smallCache = new InMemoryCache({ maxSize: 2, defaultTtlMs: 10000 });

    await smallCache.set('key1', 'value1', 10000);
    await smallCache.set('key2', 'value2', 10000);
    await smallCache.set('key3', 'value3', 10000); // Should evict key1 (LRU)

    expect(await smallCache.get('key1')).toBeNull();
    expect(await smallCache.get('key2')).toBe('value2');
    expect(await smallCache.get('key3')).toBe('value3');

    const metrics = smallCache.getMetrics();
    expect(metrics.evictions).toBeGreaterThan(0);
  });
});

describe('RedisCache', () => {
  let cache: RedisCache;

  // Skip Redis tests if Redis is not available
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const skipRedis = !process.env.TEST_REDIS;

  beforeEach(() => {
    if (skipRedis) return;
    cache = new RedisCache(redisUrl);
  });

  afterEach(async () => {
    if (skipRedis) return;
    await cache.clear();
    await cache.disconnect();
  });

  it.skipIf(skipRedis)('should set and get values', async () => {
    await cache.set('key1', 'value1', 1000);
    const value = await cache.get('key1');
    expect(value).toBe('value1');
  });

  it.skipIf(skipRedis)('should return null for missing keys', async () => {
    const value = await cache.get('nonexistent-' + Date.now());
    expect(value).toBeNull();
  });

  it.skipIf(skipRedis)('should delete values', async () => {
    await cache.set('key1', 'value1', 1000);
    await cache.delete('key1');
    const value = await cache.get('key1');
    expect(value).toBeNull();
  });

  it.skipIf(skipRedis)('should track cache hits and misses', async () => {
    const testKey = 'test-key-' + Date.now();

    await cache.set(testKey, 'value1', 1000);

    await cache.get(testKey); // hit
    await cache.get('nonexistent'); // miss
    await cache.get(testKey); // hit

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(1);
  });

  it.skipIf(skipRedis)('should expire entries after TTL', async () => {
    const testKey = 'ttl-test-' + Date.now();

    await cache.set(testKey, 'value1', 100); // 100ms TTL
    expect(await cache.get(testKey)).toBe('value1');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(await cache.get(testKey)).toBeNull();
  });
});
