/**
 * Shared Redis client module with connection pooling
 */
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export interface RedisConfig {
  url?: string;
  /**
   * Max retry attempts for connection
   * @default 3
   */
  maxRetries?: number;
  /**
   * Enable offline queue (queue commands when disconnected)
   * @default false
   */
  enableOfflineQueue?: boolean;
}

/**
 * Initialize Redis client with connection pooling
 */
export function createRedisClient(config: RedisConfig = {}): Redis {
  const { url, maxRetries = 3, enableOfflineQueue = false } = config;

  if (!url) {
    throw new Error('Redis URL is required');
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: maxRetries,
    enableOfflineQueue,
    lazyConnect: false,
    // Connection pool settings
    retryStrategy: (times: number) => {
      if (times > maxRetries) {
        // Stop retrying
        return null;
      }
      // Exponential backoff: 50ms, 100ms, 200ms, etc
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  // Error handling
  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err);
  });

  client.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...');
  });

  return client;
}

/**
 * Get singleton Redis client instance
 */
export function getRedisClient(config?: RedisConfig): Redis {
  if (!redisClient) {
    redisClient = createRedisClient(config);
  }
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Disconnected');
  }
}

/**
 * Check if Redis is connected and healthy
 */
export async function checkRedisHealth(client: Redis): Promise<boolean> {
  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] Health check failed:', error);
    return false;
  }
}
