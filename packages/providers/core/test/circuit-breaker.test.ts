import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerError,
  CircuitBreakerRegistry,
} from '../src/http/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('State transitions', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Service error'));

      // First 2 failures - should stay CLOSED
      await expect(breaker.execute(failingFn)).rejects.toThrow('Service error');
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

      await expect(breaker.execute(failingFn)).rejects.toThrow('Service error');
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

      // 3rd failure - should transition to OPEN
      await expect(breaker.execute(failingFn)).rejects.toThrow('Service error');
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reset failure count on success in CLOSED state', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));
      const successFn = vi.fn().mockResolvedValue('success');

      // 2 failures
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      // 1 success - resets counter
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

      // Need 3 more failures to open
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition to HALF_OPEN after cooldown period', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Open the circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Try immediately - should fail fast
      await expect(breaker.execute(failingFn)).rejects.toThrow(CircuitBreakerError);

      // Advance time past cooldown
      vi.advanceTimersByTime(5000);

      // Next request should transition to HALF_OPEN
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to CLOSED on success in HALF_OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));
      const successFn = vi.fn().mockResolvedValue('success');

      // Open circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      // Wait for cooldown
      vi.advanceTimersByTime(5000);

      // Probe request succeeds
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Open circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      // Wait for cooldown
      vi.advanceTimersByTime(5000);

      // Probe request fails
      await expect(breaker.execute(failingFn)).rejects.toThrow('Error');
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Fail-fast behavior', () => {
    it('should reject immediately when OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Open the circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Should fail fast without calling function
      const fastFailFn = vi.fn().mockResolvedValue('should not be called');
      await expect(breaker.execute(fastFailFn)).rejects.toThrow(CircuitBreakerError);

      // Function should not have been called
      expect(fastFailFn).not.toHaveBeenCalled();
    });

    it('should include cooldown remaining time in error', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Open the circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      // Try again - should get error with remaining time
      try {
        await breaker.execute(vi.fn());
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect((error as CircuitBreakerError).state).toBe(CircuitBreakerState.OPEN);
        expect((error as CircuitBreakerError).cooldownRemainingMs).toBeGreaterThan(0);
      }
    });
  });

  describe('Metrics', () => {
    it('should track success count', async () => {
      const successFn = vi.fn().mockResolvedValue('success');

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      const metrics = breaker.getMetrics();
      expect(metrics.successCount).toBe(3);
      expect(metrics.failureCount).toBe(0);
    });

    it('should track failure count', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(2);
      expect(metrics.successCount).toBe(0);
    });

    it('should track rejected count when OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Open circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      // Try more requests - should be rejected
      await expect(breaker.execute(vi.fn())).rejects.toThrow(CircuitBreakerError);
      await expect(breaker.execute(vi.fn())).rejects.toThrow(CircuitBreakerError);

      const metrics = breaker.getMetrics();
      expect(metrics.rejectedCount).toBe(2);
    });

    it('should record last failure time', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      const beforeTime = Date.now();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      const afterTime = Date.now();

      const metrics = breaker.getMetrics();
      expect(metrics.lastFailureTime).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.lastFailureTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('State change callback', () => {
    it('should call onStateChange callback on transitions', async () => {
      const onStateChange = vi.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        cooldownMs: 1000,
        onStateChange,
      });

      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Trigger transition to OPEN
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitBreakerState.CLOSED,
        CircuitBreakerState.OPEN,
        expect.stringContaining('failure threshold reached')
      );

      // Wait for cooldown and trigger HALF_OPEN
      vi.advanceTimersByTime(1000);
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitBreakerState.OPEN,
        CircuitBreakerState.HALF_OPEN,
        'cooldown period elapsed'
      );

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitBreakerState.HALF_OPEN,
        CircuitBreakerState.CLOSED,
        'probe request succeeded'
      );
    });
  });

  describe('Reset', () => {
    it('should reset to CLOSED state and clear metrics', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

      // Open circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Reset
      breaker.reset();

      // Verify state and metrics
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.rejectedCount).toBe(0);
      expect(metrics.lastFailureTime).toBeNull();
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry({
      failureThreshold: 3,
      cooldownMs: 5000,
    });
  });

  it('should create separate breakers for different providers', () => {
    const spotifyBreaker = registry.getOrCreate('spotify');
    const deezerBreaker = registry.getOrCreate('deezer');

    expect(spotifyBreaker).not.toBe(deezerBreaker);
  });

  it('should return same breaker for same provider', () => {
    const breaker1 = registry.getOrCreate('spotify');
    const breaker2 = registry.getOrCreate('spotify');

    expect(breaker1).toBe(breaker2);
  });

  it('should isolate failures between providers', async () => {
    const spotifyBreaker = registry.getOrCreate('spotify');
    const deezerBreaker = registry.getOrCreate('deezer');

    const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

    // Fail Spotify circuit
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();

    // Spotify is OPEN
    expect(spotifyBreaker.getState()).toBe(CircuitBreakerState.OPEN);

    // Deezer is still CLOSED
    expect(deezerBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should collect metrics from all breakers', async () => {
    const spotifyBreaker = registry.getOrCreate('spotify');
    const deezerBreaker = registry.getOrCreate('deezer');

    const successFn = vi.fn().mockResolvedValue('success');
    await spotifyBreaker.execute(successFn);
    await deezerBreaker.execute(successFn);
    await deezerBreaker.execute(successFn);

    const allMetrics = registry.getAllMetrics();

    expect(allMetrics.size).toBe(2);
    expect(allMetrics.get('spotify')?.successCount).toBe(1);
    expect(allMetrics.get('deezer')?.successCount).toBe(2);
  });

  it('should reset all breakers', async () => {
    const spotifyBreaker = registry.getOrCreate('spotify');
    const deezerBreaker = registry.getOrCreate('deezer');

    const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

    // Fail both
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();
    await expect(deezerBreaker.execute(failingFn)).rejects.toThrow();

    // Reset all
    registry.resetAll();

    // Both should be CLOSED with 0 failures
    expect(spotifyBreaker.getMetrics().failureCount).toBe(0);
    expect(deezerBreaker.getMetrics().failureCount).toBe(0);
  });

  it('should reset specific breaker', async () => {
    const spotifyBreaker = registry.getOrCreate('spotify');
    const deezerBreaker = registry.getOrCreate('deezer');

    const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

    // Fail both
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();
    await expect(deezerBreaker.execute(failingFn)).rejects.toThrow();

    // Reset only Spotify
    registry.reset('spotify');

    // Spotify reset, Deezer not
    expect(spotifyBreaker.getMetrics().failureCount).toBe(0);
    expect(deezerBreaker.getMetrics().failureCount).toBe(1);
  });

  it('should log state transitions with provider context', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const spotifyBreaker = registry.getOrCreate('spotify');
    const failingFn = vi.fn().mockRejectedValue(new Error('Error'));

    // Open Spotify circuit
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();
    await expect(spotifyBreaker.execute(failingFn)).rejects.toThrow();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CircuitBreaker:spotify]')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CLOSED → OPEN')
    );

    consoleWarnSpy.mockRestore();
  });
});
