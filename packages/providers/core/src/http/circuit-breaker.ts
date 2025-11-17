/**
 * Circuit breaker implementation for provider HTTP requests
 *
 * State machine:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing fast, rejecting requests immediately
 * - HALF_OPEN: Testing if service recovered, allowing probe requests
 */

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit
   * @default 5
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN
   * @default 30000 (30 seconds)
   */
  cooldownMs: number;

  /**
   * Optional callback for state transitions
   */
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState, reason: string) => void;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  rejectedCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitBreakerState,
    public readonly cooldownRemainingMs?: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30000, // 30 seconds
};

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private rejectedCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number = Date.now();
  private config: Required<Omit<CircuitBreakerConfig, 'onStateChange'>> & Pick<CircuitBreakerConfig, 'onStateChange'>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitBreakerState.OPEN) {
      const now = Date.now();
      const timeSinceLastFailure = this.lastFailureTime ? now - this.lastFailureTime : 0;

      if (timeSinceLastFailure >= this.config.cooldownMs) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN, 'cooldown period elapsed');
      } else {
        // Still in cooldown, reject immediately
        this.rejectedCount++;
        const remainingMs = this.config.cooldownMs - timeSinceLastFailure;
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN, retry after ${Math.ceil(remainingMs / 1000)}s`,
          CircuitBreakerState.OPEN,
          remainingMs
        );
      }
    }

    // In HALF_OPEN state, allow one probe request
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      try {
        const result = await fn();
        this.recordSuccess();
        return result;
      } catch (error) {
        this.recordFailure();
        throw error;
      }
    }

    // CLOSED state - normal operation
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.successCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Success in HALF_OPEN means service recovered
      this.transitionTo(CircuitBreakerState.CLOSED, 'probe request succeeded');
      this.failureCount = 0;
      this.lastFailureTime = null;
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failure in HALF_OPEN means service still broken
      this.transitionTo(CircuitBreakerState.OPEN, 'probe request failed');
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we've hit the failure threshold
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(
          CircuitBreakerState.OPEN,
          `failure threshold reached (${this.failureCount}/${this.config.failureThreshold})`
        );
      }
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      rejectedCount: this.rejectedCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
    };
  }

  /**
   * Reset circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.rejectedCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
  }

  private transitionTo(newState: CircuitBreakerState, reason: string): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.lastStateChange = Date.now();

    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState, reason);
    }
  }
}

/**
 * Per-provider circuit breaker registry
 * Ensures circuit breaker isolation between different providers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker for a provider
   */
  getOrCreate(providerId: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(providerId);

    if (!breaker) {
      const mergedConfig = {
        ...this.defaultConfig,
        ...config,
        onStateChange: (from: CircuitBreakerState, to: CircuitBreakerState, reason: string) => {
          // Log state transitions with provider context
          console.warn(`[CircuitBreaker:${providerId}] ${from} → ${to}: ${reason}`);

          // Call user-provided callback if exists
          const userCallback = config?.onStateChange || this.defaultConfig.onStateChange;
          if (userCallback) {
            userCallback(from, to, reason);
          }
        },
      };

      breaker = new CircuitBreaker(mergedConfig);
      this.breakers.set(providerId, breaker);
    }

    return breaker;
  }

  /**
   * Get a circuit breaker if it exists
   */
  get(providerId: string): CircuitBreaker | undefined {
    return this.breakers.get(providerId);
  }

  /**
   * Get all circuit breakers with their metrics
   */
  getAllMetrics(): Map<string, CircuitBreakerMetrics> {
    const metrics = new Map<string, CircuitBreakerMetrics>();

    for (const [providerId, breaker] of this.breakers.entries()) {
      metrics.set(providerId, breaker.getMetrics());
    }

    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset a specific circuit breaker
   */
  reset(providerId: string): void {
    const breaker = this.breakers.get(providerId);
    if (breaker) {
      breaker.reset();
    }
  }
}
