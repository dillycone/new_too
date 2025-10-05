/**
 * Tests for Gemini utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sleep,
  calculateBackoffDelay,
  classifyError,
  extractRetryAfter,
  CircuitBreaker,
  ErrorType,
  DEFAULT_RETRY_CONFIG,
} from '../gemini.js';

describe('sleep', () => {
  it('should resolve after specified time', async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(95); // Allow some variance
    expect(elapsed).toBeLessThan(150);
  });

  it('should reject if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(100, controller.signal)).rejects.toThrow('Operation aborted');
  });

  it('should reject if signal is aborted during sleep', async () => {
    const controller = new AbortController();

    setTimeout(() => controller.abort(), 50);

    await expect(sleep(200, controller.signal)).rejects.toThrow('Operation aborted');
  });
});

describe('calculateBackoffDelay', () => {
  it('should calculate exponential backoff', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, useJitter: false };

    expect(calculateBackoffDelay(0, config)).toBe(1000); // 1000 * 2^0
    expect(calculateBackoffDelay(1, config)).toBe(2000); // 1000 * 2^1
    expect(calculateBackoffDelay(2, config)).toBe(4000); // 1000 * 2^2
    expect(calculateBackoffDelay(3, config)).toBe(8000); // 1000 * 2^3
  });

  it('should cap at maxDelayMs', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, useJitter: false, maxDelayMs: 5000 };

    expect(calculateBackoffDelay(10, config)).toBe(5000);
  });

  it('should apply jitter when enabled', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, useJitter: true };

    const delays = Array.from({ length: 100 }, () => calculateBackoffDelay(2, config));

    // All delays should be less than or equal to the capped delay
    const maxDelay = Math.min(4000, DEFAULT_RETRY_CONFIG.maxDelayMs);
    delays.forEach((delay) => {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(maxDelay);
    });

    // Delays should vary (jitter)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(50); // Should have variety
  });

  it('should use custom backoff multiplier', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, useJitter: false, backoffMultiplier: 3 };

    expect(calculateBackoffDelay(0, config)).toBe(1000); // 1000 * 3^0
    expect(calculateBackoffDelay(1, config)).toBe(3000); // 1000 * 3^1
    expect(calculateBackoffDelay(2, config)).toBe(9000); // 1000 * 3^2
  });
});

describe('classifyError', () => {
  it('should classify rate limit errors', () => {
    expect(classifyError({ status: 429 })).toBe(ErrorType.RETRYABLE_RATE_LIMIT);
    expect(classifyError({ message: 'rate limit exceeded' })).toBe(ErrorType.RETRYABLE_RATE_LIMIT);
    expect(classifyError({ message: 'too many requests' })).toBe(ErrorType.RETRYABLE_RATE_LIMIT);
    expect(classifyError({ message: 'quota exceeded' })).toBe(ErrorType.RETRYABLE_RATE_LIMIT);
  });

  it('should classify authentication errors', () => {
    expect(classifyError({ status: 401 })).toBe(ErrorType.NON_RETRYABLE_AUTH);
    expect(classifyError({ status: 403 })).toBe(ErrorType.NON_RETRYABLE_AUTH);
  });

  it('should classify client errors', () => {
    expect(classifyError({ status: 400 })).toBe(ErrorType.NON_RETRYABLE_CLIENT);
    expect(classifyError({ status: 404 })).toBe(ErrorType.NON_RETRYABLE_CLIENT);
    expect(classifyError({ message: 'aborted' })).toBe(ErrorType.NON_RETRYABLE_CLIENT);
    expect(classifyError({ message: 'cancelled' })).toBe(ErrorType.NON_RETRYABLE_CLIENT);
  });

  it('should classify server errors', () => {
    expect(classifyError({ status: 500 })).toBe(ErrorType.RETRYABLE_SERVER);
    expect(classifyError({ status: 502 })).toBe(ErrorType.RETRYABLE_SERVER);
    expect(classifyError({ status: 503 })).toBe(ErrorType.RETRYABLE_SERVER);
  });

  it('should classify network errors', () => {
    expect(classifyError({ message: 'network error' })).toBe(ErrorType.RETRYABLE_NETWORK);
    expect(classifyError({ message: 'timeout' })).toBe(ErrorType.RETRYABLE_NETWORK);
    expect(classifyError({ message: 'ECONNREFUSED' })).toBe(ErrorType.RETRYABLE_NETWORK);
    expect(classifyError({ message: 'ECONNRESET' })).toBe(ErrorType.RETRYABLE_NETWORK);
    expect(classifyError({ message: 'ETIMEDOUT' })).toBe(ErrorType.RETRYABLE_NETWORK);
    expect(classifyError({ message: 'socket hang up' })).toBe(ErrorType.RETRYABLE_NETWORK);
  });

  it('should classify unknown errors', () => {
    expect(classifyError(null)).toBe(ErrorType.UNKNOWN);
    expect(classifyError({})).toBe(ErrorType.UNKNOWN);
    expect(classifyError({ message: 'unknown error' })).toBe(ErrorType.UNKNOWN);
  });
});

describe('extractRetryAfter', () => {
  it('should extract numeric retry-after in seconds', () => {
    const error = {
      response: {
        headers: {
          'retry-after': '30',
        },
      },
    };

    expect(extractRetryAfter(error)).toBe(30000); // 30 seconds in ms
  });

  it('should extract retry-after from different header locations', () => {
    const error1 = {
      headers: {
        'retry-after': '10',
      },
    };

    expect(extractRetryAfter(error1)).toBe(10000);
  });

  it('should extract HTTP date retry-after', () => {
    const futureDate = new Date(Date.now() + 60000); // 1 minute from now
    const error = {
      response: {
        headers: {
          'retry-after': futureDate.toUTCString(),
        },
      },
    };

    const result = extractRetryAfter(error);
    expect(result).toBeGreaterThan(50000); // Around 60 seconds
    expect(result).toBeLessThan(70000);
  });

  it('should return null for past dates', () => {
    const pastDate = new Date(Date.now() - 60000); // 1 minute ago
    const error = {
      response: {
        headers: {
          'retry-after': pastDate.toUTCString(),
        },
      },
    };

    expect(extractRetryAfter(error)).toBeNull();
  });

  it('should return null when retry-after is missing', () => {
    expect(extractRetryAfter({})).toBeNull();
    expect(extractRetryAfter({ response: {} })).toBeNull();
    expect(extractRetryAfter({ response: { headers: {} } })).toBeNull();
  });

  it('should return null for invalid retry-after values', () => {
    const error = {
      response: {
        headers: {
          'retry-after': 'invalid',
        },
      },
    };

    expect(extractRetryAfter(error)).toBeNull();
  });
});

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000);
  });

  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('should allow operations in CLOSED state', () => {
    expect(() => breaker.checkState()).not.toThrow();
  });

  it('should track failures', () => {
    breaker.recordFailure();
    expect(breaker.getFailureCount()).toBe(1);

    breaker.recordFailure();
    expect(breaker.getFailureCount()).toBe(2);
  });

  it('should open circuit after threshold failures', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getState()).toBe('OPEN');
    expect(() => breaker.checkState()).toThrow('Circuit breaker is OPEN');
  });

  it('should reset on success', () => {
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getFailureCount()).toBe(2);

    breaker.recordSuccess();

    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getState()).toBe('OPEN');

    // Advance fake timers past timeout
    vi.advanceTimersByTime(1100);

    breaker.checkState(); // This should transition to HALF_OPEN

    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('should allow operation in HALF_OPEN state', async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.getState()).toBe('OPEN');

    vi.advanceTimersByTime(1100);

    expect(() => breaker.checkState()).not.toThrow();
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('should close circuit on success in HALF_OPEN state', async () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    vi.advanceTimersByTime(1100);

    breaker.checkState(); // Transition to HALF_OPEN
    breaker.recordSuccess();

    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('should provide helpful error message when open', () => {
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(() => breaker.checkState()).toThrow(/Circuit breaker is OPEN/);
    expect(() => breaker.checkState()).toThrow(/Too many consecutive failures/);
    expect(() => breaker.checkState()).toThrow(/Will retry after/);
  });
});
