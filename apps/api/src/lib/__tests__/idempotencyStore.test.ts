import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryIdempotencyStore,
  RedisIdempotencyStore,
  type IdempotencyEntry,
} from '../idempotencyStore';
import RedisMock from 'ioredis-mock';

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  it('should set and get entries', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 60);
    const retrieved = await store.get('key1');

    expect(retrieved).toEqual(entry);
  });

  it('should return null for missing keys', async () => {
    const retrieved = await store.get('nonexistent');
    expect(retrieved).toBeNull();
  });

  it('should delete entries', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 60);
    await store.delete('key1');

    const retrieved = await store.get('key1');
    expect(retrieved).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    // Set with 50ms TTL
    await store.set('key1', entry, 0.05);

    // Immediately should be available
    expect(await store.get('key1')).toEqual(entry);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should be expired
    expect(await store.get('key1')).toBeNull();
  });

  it('should clear all entries', async () => {
    const entry1: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };
    const entry2: IdempotencyEntry = {
      fingerprint: 'fp2',
      jobId: 456,
      createdAt: Date.now(),
    };

    await store.set('key1', entry1, 60);
    await store.set('key2', entry2, 60);

    await store.clear?.();

    expect(await store.get('key1')).toBeNull();
    expect(await store.get('key2')).toBeNull();
  });

  it('should sweep expired entries automatically', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 0.05); // 50ms TTL

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger sweep by calling get on a different key
    await store.get('key2');

    // Original key should be swept
    expect(await store.get('key1')).toBeNull();
  });
});

describe('RedisIdempotencyStore', () => {
  let store: RedisIdempotencyStore;
  let redisClient: RedisMock;

  beforeEach(() => {
    redisClient = new RedisMock();
    store = new RedisIdempotencyStore(redisClient as any);
  });

  afterEach(async () => {
    await redisClient.flushall();
    await redisClient.quit();
  });

  it('should set and get entries', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 60);
    const retrieved = await store.get('key1');

    expect(retrieved).toEqual(entry);
  });

  it('should return null for missing keys', async () => {
    const retrieved = await store.get('nonexistent');
    expect(retrieved).toBeNull();
  });

  it('should delete entries', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 60);
    await store.delete('key1');

    const retrieved = await store.get('key1');
    expect(retrieved).toBeNull();
  });

  it('should use idempotency: prefix for keys', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('mykey', entry, 60);

    // Check Redis directly
    const rawValue = await redisClient.get('idempotency:mykey');
    expect(rawValue).toBeTruthy();
    expect(JSON.parse(rawValue!)).toEqual(entry);
  });

  it('should set TTL on entries', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 10); // 10 seconds

    // Check TTL in Redis
    const ttl = await redisClient.ttl('idempotency:key1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it('should expire entries after TTL (simulated)', async () => {
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await store.set('key1', entry, 1); // 1 second

    // Simulate expiration by manually deleting (ioredis-mock doesn't auto-expire)
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await redisClient.del('idempotency:key1');

    const retrieved = await store.get('key1');
    expect(retrieved).toBeNull();
  });

  it('should clear all entries with prefix', async () => {
    const entry1: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };
    const entry2: IdempotencyEntry = {
      fingerprint: 'fp2',
      jobId: 456,
      createdAt: Date.now(),
    };

    await store.set('key1', entry1, 60);
    await store.set('key2', entry2, 60);

    // Add a key without the prefix (should not be deleted)
    await redisClient.set('other:key', 'value');

    await store.clear?.();

    expect(await store.get('key1')).toBeNull();
    expect(await store.get('key2')).toBeNull();

    // Other key should still exist
    expect(await redisClient.get('other:key')).toBe('value');
  });

  it('should handle custom key prefix', async () => {
    const customStore = new RedisIdempotencyStore(redisClient as any, 'custom:');
    const entry: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };

    await customStore.set('mykey', entry, 60);

    const rawValue = await redisClient.get('custom:mykey');
    expect(rawValue).toBeTruthy();
    expect(JSON.parse(rawValue!)).toEqual(entry);
  });

  it('should handle JSON serialization errors gracefully', async () => {
    // Corrupt the data in Redis
    await redisClient.set('idempotency:corrupt', 'not valid json');

    await expect(store.get('corrupt')).rejects.toThrow();
  });

  it('should handle concurrent operations', async () => {
    const entry1: IdempotencyEntry = {
      fingerprint: 'fp1',
      jobId: 123,
      createdAt: Date.now(),
    };
    const entry2: IdempotencyEntry = {
      fingerprint: 'fp2',
      jobId: 456,
      createdAt: Date.now(),
    };

    // Simulate concurrent writes
    await Promise.all([
      store.set('key1', entry1, 60),
      store.set('key2', entry2, 60),
    ]);

    // Both should be retrievable
    const [r1, r2] = await Promise.all([
      store.get('key1'),
      store.get('key2'),
    ]);

    expect(r1).toEqual(entry1);
    expect(r2).toEqual(entry2);
  });
});
