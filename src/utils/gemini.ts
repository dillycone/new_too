import { GoogleGenAI, FileState } from '@google/genai';
import { getConfig } from '../config/index.js';

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolveSleep, rejectSleep) => {
    if (signal?.aborted) {
      rejectSleep(new Error('Operation aborted'));
      return;
    }

    let timeout: NodeJS.Timeout;

    const onAbort = () => {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      rejectSleep(new Error('Operation aborted'));
    };

    timeout = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolveSleep();
    }, ms);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

/**
 * Retry configuration interface for controlling backoff and retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry (default: 1000ms) */
  initialDelayMs: number;
  /** Maximum delay between retries in milliseconds (default: 30000ms) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Whether to use full jitter strategy (default: true) */
  useJitter: boolean;
  /** Circuit breaker failure threshold before opening circuit (default: 3) */
  circuitBreakerThreshold: number;
  /** Circuit breaker timeout in milliseconds before attempting reset (default: 60000ms) */
  circuitBreakerTimeoutMs: number;
}

/**
 * Default retry configuration with sensible production defaults
 * Based on AWS retry best practices with full jitter
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  useJitter: true,
  circuitBreakerThreshold: 3,
  circuitBreakerTimeoutMs: 60000,
};

/**
 * Error classification for retry decision making
 */
export enum ErrorType {
  /** Network errors, timeouts - should retry */
  RETRYABLE_NETWORK = 'RETRYABLE_NETWORK',
  /** Rate limiting (429) - should retry with backoff */
  RETRYABLE_RATE_LIMIT = 'RETRYABLE_RATE_LIMIT',
  /** Server errors (5xx) - should retry */
  RETRYABLE_SERVER = 'RETRYABLE_SERVER',
  /** Authentication errors (401, 403) - should not retry */
  NON_RETRYABLE_AUTH = 'NON_RETRYABLE_AUTH',
  /** Client errors (4xx except 429) - should not retry */
  NON_RETRYABLE_CLIENT = 'NON_RETRYABLE_CLIENT',
  /** Unknown errors - retry with caution */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Calculates backoff delay using full jitter strategy
 * Full jitter recommended by AWS: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 *
 * @param attemptNumber - Current retry attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attemptNumber: number, config: RetryConfig): number {
  const { initialDelayMs, maxDelayMs, backoffMultiplier, useJitter } = config;

  // Calculate exponential backoff: initialDelay * (backoffMultiplier ^ attemptNumber)
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attemptNumber);

  // Cap at maxDelayMs
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (useJitter) {
    // Full jitter: random value between 0 and cappedDelay
    return Math.random() * cappedDelay;
  }

  return cappedDelay;
}

/**
 * Classifies an error to determine if it should be retried
 *
 * @param error - The error to classify
 * @returns ErrorType classification
 */
export function classifyError(error: unknown): ErrorType {
  if (!error) {
    return ErrorType.UNKNOWN;
  }

  const errorObj = error as any;
  const message = errorObj?.message?.toLowerCase() || '';
  const status = errorObj?.status || errorObj?.statusCode || errorObj?.code;

  // Check for abort/cancellation - never retry
  if (message.includes('abort') || message.includes('cancel')) {
    return ErrorType.NON_RETRYABLE_CLIENT;
  }

  // Check HTTP status codes
  if (typeof status === 'number') {
    if (status === 429) {
      return ErrorType.RETRYABLE_RATE_LIMIT;
    }
    if (status === 401 || status === 403) {
      return ErrorType.NON_RETRYABLE_AUTH;
    }
    if (status >= 400 && status < 500) {
      return ErrorType.NON_RETRYABLE_CLIENT;
    }
    if (status >= 500) {
      return ErrorType.RETRYABLE_SERVER;
    }
  }

  // Check for network-related errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('socket hang up')
  ) {
    return ErrorType.RETRYABLE_NETWORK;
  }

  // Check for rate limiting keywords
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded')
  ) {
    return ErrorType.RETRYABLE_RATE_LIMIT;
  }

  // Default to unknown, which can be retried cautiously
  return ErrorType.UNKNOWN;
}

/**
 * Extracts Retry-After header value from error response
 *
 * @param error - The error object
 * @returns Delay in milliseconds, or null if not found
 */
export function extractRetryAfter(error: unknown): number | null {
  const errorObj = error as any;
  const retryAfter = errorObj?.response?.headers?.[
    'retry-after'
  ] || errorObj?.headers?.['retry-after'];

  if (!retryAfter) {
    return null;
  }

  // Try parsing as seconds (numeric)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // Convert to milliseconds
  }

  // Try parsing as HTTP date
  try {
    const date = new Date(retryAfter);
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : null;
  } catch {
    return null;
  }
}

/**
 * Circuit Breaker pattern implementation
 * Prevents repeated failures by opening the circuit after threshold is reached
 */
export class CircuitBreaker {
  private failureCount = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private lastFailureTime: number | null = null;

  constructor(
    private threshold: number,
    private timeoutMs: number
  ) {}

  /**
   * Records a successful operation
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
  }

  /**
   * Records a failed operation
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Checks if operation should be allowed
   * @throws Error if circuit is open
   */
  checkState(): void {
    if (this.state === 'CLOSED') {
      return;
    }

    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);

      if (timeSinceLastFailure >= this.timeoutMs) {
        // Try half-open state
        this.state = 'HALF_OPEN';
        return;
      }

      throw new Error(
        `Circuit breaker is OPEN. Too many consecutive failures (${this.failureCount}). ` +
        `Will retry after ${Math.ceil((this.timeoutMs - timeSinceLastFailure) / 1000)}s`
      );
    }

    // HALF_OPEN state - allow the attempt
  }

  /**
   * Gets current circuit state
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  /**
   * Gets current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }
}

export const ensureNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }
};

export const extractFileName = (uri?: string | null): string | null => {
  if (!uri) {
    return null;
  }

  const match = uri.match(/files\/[a-z0-9\-]+/i);
  return match ? match[0] : null;
};

export async function waitForGeminiFileReady(
  ai: GoogleGenAI,
  fileName: string,
  emitStatus: (message: string) => void,
  timeoutMs?: number,
  pollIntervalMs?: number,
  signal?: AbortSignal,
  retryConfig?: Partial<RetryConfig>
): Promise<void> {
  const config = getConfig();
  const actualTimeoutMs = timeoutMs ?? config.gemini.readyTimeoutMs;
  const actualPollIntervalMs = pollIntervalMs ?? config.gemini.pollIntervalMs;

  // Merge with default retry config and config overrides
  const finalRetryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    maxRetries: config.gemini.retryMaxAttempts ?? DEFAULT_RETRY_CONFIG.maxRetries,
    initialDelayMs: config.gemini.retryInitialDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs,
    maxDelayMs: config.gemini.retryMaxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    backoffMultiplier: config.gemini.retryBackoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier,
    circuitBreakerThreshold: config.gemini.circuitBreakerThreshold ?? DEFAULT_RETRY_CONFIG.circuitBreakerThreshold,
    circuitBreakerTimeoutMs: config.gemini.circuitBreakerTimeoutMs ?? DEFAULT_RETRY_CONFIG.circuitBreakerTimeoutMs,
    ...retryConfig,
  };

  const normalizedName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  const startTime = Date.now();
  let lastState: FileState | undefined;
  let attemptNumber = 0;

  // Initialize circuit breaker
  const circuitBreaker = new CircuitBreaker(
    finalRetryConfig.circuitBreakerThreshold,
    finalRetryConfig.circuitBreakerTimeoutMs
  );

  emitStatus('Waiting for Gemini to finish processing the uploaded file...');

  while (Date.now() - startTime < actualTimeoutMs) {
    ensureNotAborted(signal);

    try {
      // Check circuit breaker state before attempting
      circuitBreaker.checkState();

      const file = await ai.files.get({ name: normalizedName });
      const state = file.state as FileState | undefined;

      if (state !== lastState && state) {
        emitStatus(`Gemini file state: ${state}`);
        lastState = state;
      }

      if (state === FileState.ACTIVE) {
        // Success - record it for circuit breaker
        circuitBreaker.recordSuccess();
        return;
      }

      if (state === FileState.FAILED) {
        const errorMessage = file.error?.message;
        throw new Error(
          errorMessage ? `Gemini failed to process the uploaded file: ${errorMessage}` : 'Gemini failed to process the uploaded file.'
        );
      }

      // File still processing - reset attempt counter and circuit breaker on successful poll
      if (attemptNumber > 0) {
        attemptNumber = 0;
        circuitBreaker.recordSuccess();
      }

      await sleep(actualPollIntervalMs, signal);
    } catch (error) {
      ensureNotAborted(signal);

      // Classify the error
      const errorType = classifyError(error);
      const shouldRetry =
        errorType === ErrorType.RETRYABLE_NETWORK ||
        errorType === ErrorType.RETRYABLE_RATE_LIMIT ||
        errorType === ErrorType.RETRYABLE_SERVER ||
        (errorType === ErrorType.UNKNOWN && attemptNumber < finalRetryConfig.maxRetries);

      // Check if we've exhausted retries
      if (!shouldRetry || attemptNumber >= finalRetryConfig.maxRetries) {
        emitStatus(`Operation failed after ${attemptNumber + 1} attempts: ${(error as Error).message}`);
        throw error;
      }

      // Record failure for circuit breaker
      circuitBreaker.recordFailure();

      // Calculate backoff delay
      let backoffDelay = calculateBackoffDelay(attemptNumber, finalRetryConfig);

      // For rate limiting, respect Retry-After header if present
      if (errorType === ErrorType.RETRYABLE_RATE_LIMIT) {
        const retryAfter = extractRetryAfter(error);
        if (retryAfter !== null) {
          backoffDelay = Math.min(retryAfter, finalRetryConfig.maxDelayMs);
          emitStatus(`Rate limited. Respecting Retry-After header: ${Math.ceil(backoffDelay / 1000)}s`);
        }
      }

      // Emit detailed retry status
      attemptNumber++;
      const delaySeconds = Math.ceil(backoffDelay / 1000);
      const errorMessage = (error as Error).message;

      emitStatus(
        `Retry ${attemptNumber}/${finalRetryConfig.maxRetries} after error (${errorType}): ${errorMessage}`
      );
      emitStatus(
        `Waiting ${delaySeconds}s before retry (circuit breaker: ${circuitBreaker.getState()})...`
      );

      // Wait for backoff delay
      try {
        await sleep(backoffDelay, signal);
      } catch (sleepError) {
        // If sleep was aborted, throw the abort error instead
        throw sleepError;
      }

      // Check if we still have time left
      if (Date.now() - startTime >= actualTimeoutMs) {
        throw new Error(
          `Timed out waiting for Gemini to process the uploaded file after ${attemptNumber} retry attempts.`
        );
      }
    }
  }

  throw new Error('Timed out waiting for Gemini to process the uploaded file.');
}
