/**
 * Idempotency store interface and implementations
 */
import type Redis from 'ioredis';

export type IdempotencyEntry = {
  fingerprint: string;
  jobId: number;
  createdAt: number;
};

/**
 * Abstract interface for idempotency storage backends
 */
export interface IdempotencyStore {
  /**
   * Get an idempotency entry by key
   */
  get(key: string): Promise<IdempotencyEntry | null>;

  /**
   * Set an idempotency entry with TTL
   */
  set(key: string, entry: IdempotencyEntry, ttlSeconds: number): Promise<void>;

  /**
   * Delete an idempotency entry
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all entries (for testing)
   */
  clear?(): Promise<void>;
}

/**
 * In-memory idempotency store using Map
 * Used for development and testing
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, { entry: IdempotencyEntry; expiresAt: number }>();

  async get(key: string): Promise<IdempotencyEntry | null> {
    this.sweepExpired();

    const record = this.store.get(key);
    if (!record) {
      return null;
    }

    // Check if expired
    if (record.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return record.entry;
  }

  async set(key: string, entry: IdempotencyEntry, ttlSeconds: number): Promise<void> {
    this.sweepExpired();

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { entry, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (record.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Redis-based idempotency store
 * Used for production with multiple API instances
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private client: Redis;
  private keyPrefix: string;

  constructor(client: Redis, keyPrefix: string = 'idempotency:') {
    this.client = client;
    this.keyPrefix = keyPrefix;
  }

  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<IdempotencyEntry | null> {
    try {
      const fullKey = this.getFullKey(key);
      const data = await this.client.get(fullKey);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as IdempotencyEntry;
    } catch (error) {
      console.error('[RedisIdempotencyStore] Failed to get entry:', error);
      throw new Error('Failed to retrieve idempotency entry from Redis');
    }
  }

  async set(key: string, entry: IdempotencyEntry, ttlSeconds: number): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const data = JSON.stringify(entry);

      // Use SET with EX for atomic set + TTL
      await this.client.set(fullKey, data, 'EX', ttlSeconds);
    } catch (error) {
      console.error('[RedisIdempotencyStore] Failed to set entry:', error);
      throw new Error('Failed to store idempotency entry in Redis');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await this.client.del(fullKey);
    } catch (error) {
      console.error('[RedisIdempotencyStore] Failed to delete entry:', error);
      throw new Error('Failed to delete idempotency entry from Redis');
    }
  }

  async clear(): Promise<void> {
    try {
      // Find all keys with our prefix
      const keys = await this.client.keys(`${this.keyPrefix}*`);

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('[RedisIdempotencyStore] Failed to clear entries:', error);
      throw new Error('Failed to clear idempotency entries from Redis');
    }
  }
}

/**
 * Create idempotency store based on configuration
 */
export function createIdempotencyStore(config: {
  backend: 'redis' | 'memory';
  redisClient?: Redis;
  isDevelopment?: boolean;
}): IdempotencyStore {
  const { backend, redisClient, isDevelopment = false } = config;

  if (backend === 'redis') {
    if (!redisClient) {
      if (isDevelopment) {
        console.warn(
          '[Idempotency] Redis backend selected but no client provided. Falling back to in-memory store for development.'
        );
        return new InMemoryIdempotencyStore();
      }
      throw new Error('Redis client is required when backend is "redis"');
    }

    return new RedisIdempotencyStore(redisClient);
  }

  if (isDevelopment && backend === 'memory') {
    console.warn('[Idempotency] Using in-memory store (development mode)');
  }

  return new InMemoryIdempotencyStore();
}
