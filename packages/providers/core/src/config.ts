/**
 * Provider HTTP client configuration
 */
export interface CacheConfig {
  /**
   * Cache backend type: 'memory' (LRU) or 'redis'
   * @default 'memory'
   */
  backend: 'memory' | 'redis';

  /**
   * Default TTL for cached responses in milliseconds
   * @default 60000 (1 minute)
   */
  ttlMs: number;

  /**
   * Maximum cache size (for in-memory backend)
   * @default 1000
   */
  maxSize: number;

  /**
   * Redis URL (required if backend is 'redis')
   */
  redisUrl?: string;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening circuit
   * @default 5
   */
  failureThreshold: number;

  /**
   * Cooldown period in milliseconds before transitioning to half-open
   * @default 30000 (30 seconds)
   */
  cooldownMs: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  backend: 'memory',
  ttlMs: 60000, // 1 minute
  maxSize: 1000,
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30000, // 30 seconds
};

/**
 * Get cache configuration from environment variables
 */
export function getCacheConfigFromEnv(): Partial<CacheConfig> {
  return {
    backend: (process.env.PROVIDER_CACHE_BACKEND as 'memory' | 'redis') || 'memory',
    ttlMs: process.env.PROVIDER_CACHE_TTL_MS
      ? Number(process.env.PROVIDER_CACHE_TTL_MS)
      : undefined,
    maxSize: process.env.PROVIDER_CACHE_MAX_SIZE
      ? Number(process.env.PROVIDER_CACHE_MAX_SIZE)
      : undefined,
    redisUrl: process.env.PROVIDER_CACHE_REDIS_URL || process.env.REDIS_URL,
  };
}

/**
 * Merge cache config with defaults
 */
export function resolveCacheConfig(
  overrides: Partial<CacheConfig> = {}
): CacheConfig {
  return {
    ...DEFAULT_CACHE_CONFIG,
    ...getCacheConfigFromEnv(),
    ...overrides,
  };
}

/**
 * Get circuit breaker configuration from environment variables
 */
export function getCircuitBreakerConfigFromEnv(): Partial<CircuitBreakerConfig> {
  return {
    failureThreshold: process.env.PROVIDER_CIRCUIT_BREAKER_THRESHOLD
      ? Number(process.env.PROVIDER_CIRCUIT_BREAKER_THRESHOLD)
      : undefined,
    cooldownMs: process.env.PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS
      ? Number(process.env.PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS)
      : undefined,
  };
}

/**
 * Merge circuit breaker config with defaults
 */
export function resolveCircuitBreakerConfig(
  overrides: Partial<CircuitBreakerConfig> = {}
): CircuitBreakerConfig {
  return {
    ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
    ...getCircuitBreakerConfigFromEnv(),
    ...overrides,
  };
}
