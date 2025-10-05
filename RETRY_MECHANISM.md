# Retry/Backoff Mechanism Documentation

## Overview

A comprehensive retry and backoff mechanism has been implemented for the `waitForGeminiFileReady` function in `src/utils/gemini.ts`. This implementation follows AWS best practices for exponential backoff with full jitter and includes circuit breaker pattern for protection against repeated failures.

## Features

### 1. Retry Configuration Types
- **RetryConfig Interface**: Configurable retry behavior
- **DEFAULT_RETRY_CONFIG**: Sensible production defaults
- Environment variable support for all retry parameters

### 2. Utility Functions

#### `calculateBackoffDelay(attemptNumber, config)`
- Implements full jitter strategy (recommended by AWS)
- Formula: `random() * min(initialDelay * (multiplier ^ attempt), maxDelay)`
- Prevents thundering herd problem

#### `classifyError(error)`
- Categorizes errors into retryable and non-retryable types
- Error types:
  - `RETRYABLE_NETWORK`: Network errors, timeouts
  - `RETRYABLE_RATE_LIMIT`: 429 status codes
  - `RETRYABLE_SERVER`: 5xx errors
  - `NON_RETRYABLE_AUTH`: 401, 403 errors
  - `NON_RETRYABLE_CLIENT`: 4xx errors (except 429)
  - `UNKNOWN`: Unknown errors (retry with caution)

#### `extractRetryAfter(error)`
- Parses Retry-After headers from 429 responses
- Supports both numeric (seconds) and HTTP date formats

#### `CircuitBreaker` Class
- Prevents repeated failures from overwhelming the system
- States: CLOSED, OPEN, HALF_OPEN
- Opens after threshold failures
- Automatically attempts reset after timeout

### 3. Enhanced `waitForGeminiFileReady` Function

#### New Parameters
```typescript
retryConfig?: Partial<RetryConfig>
```

#### Retry Logic
1. Classifies errors using `classifyError()`
2. Determines if retry is appropriate
3. Records failures in circuit breaker
4. Calculates backoff delay with full jitter
5. Respects Retry-After headers for 429 errors
6. Emits detailed status messages during retries

#### Status Messages
- "Retry X/Y after error (ERROR_TYPE): message"
- "Waiting Ns before retry (circuit breaker: STATE)..."
- "Rate limited. Respecting Retry-After header: Xs"
- "Operation failed after X attempts: message"

## Configuration

### Environment Variables

```bash
# Retry configuration
GEMINI_RETRY_MAX_ATTEMPTS=5                    # Max retry attempts (default: 5)
GEMINI_RETRY_INITIAL_DELAY_MS=1000            # Initial delay (default: 1000ms)
GEMINI_RETRY_MAX_DELAY_MS=30000               # Max delay (default: 30000ms)
GEMINI_RETRY_BACKOFF_MULTIPLIER=2             # Backoff multiplier (default: 2)

# Circuit breaker configuration
GEMINI_CIRCUIT_BREAKER_THRESHOLD=3            # Failures before opening (default: 3)
GEMINI_CIRCUIT_BREAKER_TIMEOUT_MS=60000       # Timeout before reset (default: 60000ms)
```

### Default Configuration

```typescript
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  useJitter: true,
  circuitBreakerThreshold: 3,
  circuitBreakerTimeoutMs: 60000,
};
```

### Programmatic Configuration

```typescript
import { waitForGeminiFileReady } from './utils/gemini.js';

// Custom retry config
await waitForGeminiFileReady(
  ai,
  fileName,
  emitStatus,
  timeoutMs,
  pollIntervalMs,
  signal,
  {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 10000,
  }
);
```

## Usage Examples

### Example 1: Using Environment Variables

```bash
# Set retry configuration
export GEMINI_RETRY_MAX_ATTEMPTS=3
export GEMINI_RETRY_INITIAL_DELAY_MS=2000
export GEMINI_RETRY_MAX_DELAY_MS=60000

# Run your application
npm start
```

### Example 2: Programmatic Override

```typescript
import { runGeminiMediaTask } from './utils/geminiMediaTask.js';

const result = await runGeminiMediaTask({
  filePath: '/path/to/media.mp4',
  processingStatus: 'Processing...',
  generatingStatus: 'Generating...',
  completionStatus: 'Complete!',
  buildContents: async ({ fileUri, createPartFromUri, createUserContent }) => {
    return createUserContent([createPartFromUri({ fileUri })]);
  },
  retryConfig: {
    maxRetries: 10,        // More aggressive retries
    initialDelayMs: 500,   // Start with shorter delay
    maxDelayMs: 120000,    // Allow longer max delay
  },
});
```

### Example 3: Status Message Handling

```typescript
const statusMessages: string[] = [];

await waitForGeminiFileReady(
  ai,
  fileName,
  (message) => {
    statusMessages.push(message);
    console.log(`[${new Date().toISOString()}] ${message}`);
  },
  timeoutMs,
  pollIntervalMs,
  signal
);

// Example output:
// [2025-10-05T12:00:00.000Z] Waiting for Gemini to finish processing the uploaded file...
// [2025-10-05T12:00:01.000Z] Gemini file state: PROCESSING
// [2025-10-05T12:00:02.000Z] Retry 1/5 after error (RETRYABLE_NETWORK): Network timeout
// [2025-10-05T12:00:02.001Z] Waiting 1s before retry (circuit breaker: CLOSED)...
// [2025-10-05T12:00:03.000Z] Gemini file state: ACTIVE
```

## Error Handling

### Retryable Errors
The mechanism automatically retries these error types:
- Network timeouts
- Connection refused/reset
- 429 Rate limiting (respects Retry-After)
- 5xx Server errors
- Unknown errors (limited retries)

### Non-Retryable Errors
These errors fail immediately without retry:
- 401 Unauthorized
- 403 Forbidden
- 4xx Client errors (except 429)
- Aborted operations

### Circuit Breaker Protection
After `circuitBreakerThreshold` consecutive failures:
1. Circuit opens
2. All requests fail fast with helpful error message
3. After `circuitBreakerTimeoutMs`, circuit enters HALF_OPEN state
4. Single successful request closes the circuit

## Implementation Details

### Files Modified

1. **src/utils/gemini.ts**
   - Added `RetryConfig` interface and `DEFAULT_RETRY_CONFIG`
   - Added `ErrorType` enum
   - Implemented `calculateBackoffDelay()` function
   - Implemented `classifyError()` function
   - Implemented `extractRetryAfter()` function
   - Implemented `CircuitBreaker` class
   - Enhanced `waitForGeminiFileReady()` with retry logic

2. **src/utils/geminiMediaTask.ts**
   - Added `RetryConfig` import
   - Added `retryConfig` parameter to `GeminiMediaTaskOptions`
   - Passes `retryConfig` to `waitForGeminiFileReady()`

3. **src/config/schema.ts**
   - Added retry configuration fields to `geminiConfigSchema`
   - Added retry environment variables to `envSchema`

4. **src/config/index.ts**
   - Added retry environment variables to `rawEnv`
   - Added retry configuration to `configInput.gemini`

## Backoff Strategy: Full Jitter

The implementation uses **full jitter** as recommended by AWS:

```
delay = random() * min(cap, base * 2^attempt)
```

### Benefits:
1. **Prevents thundering herd**: Clients don't retry simultaneously
2. **Better than no jitter**: Spreads load over time
3. **Better than equal jitter**: More randomness = better distribution
4. **Production proven**: Used by AWS services

### Comparison:
- **No jitter**: `delay = min(cap, base * 2^attempt)`
- **Equal jitter**: `delay = base/2 + random(0, base/2) * 2^attempt`
- **Full jitter**: `delay = random(0, min(cap, base * 2^attempt))`

## Testing

### Manual Testing

```typescript
// Test network error retry
const mockAI = {
  files: {
    get: async () => {
      throw new Error('ECONNREFUSED');
    }
  }
};

// Should retry 5 times with backoff
await waitForGeminiFileReady(mockAI, 'test-file', console.log);
```

### Integration Testing

```bash
# Test with aggressive retry settings
export GEMINI_RETRY_MAX_ATTEMPTS=10
export GEMINI_RETRY_INITIAL_DELAY_MS=100
export GEMINI_RETRY_MAX_DELAY_MS=5000

# Run transcription command
npm run transcribe -- /path/to/file.mp4
```

## Performance Characteristics

### Default Configuration
- Attempt 0: 0-1s delay
- Attempt 1: 0-2s delay
- Attempt 2: 0-4s delay
- Attempt 3: 0-8s delay
- Attempt 4: 0-16s delay
- Attempt 5: 0-30s delay (capped)

### Total Retry Time (worst case)
- With full jitter: ~30s average
- Without jitter: ~61s deterministic

## Backward Compatibility

The retry mechanism is **fully backward compatible**:
- All existing function calls work without changes
- Default retry behavior is applied automatically
- Can be disabled by setting `GEMINI_RETRY_MAX_ATTEMPTS=0`

## Best Practices

1. **Use environment variables** for production configuration
2. **Override programmatically** for special cases only
3. **Monitor status messages** to understand retry behavior
4. **Tune circuit breaker** based on your API's reliability
5. **Respect rate limits** - don't set maxRetries too high
6. **Log retry events** for debugging and monitoring

## Troubleshooting

### "Circuit breaker is OPEN" error
- Too many consecutive failures occurred
- Wait for circuit breaker timeout to elapse
- Check if API credentials are valid
- Verify network connectivity

### Excessive retries
- Reduce `GEMINI_RETRY_MAX_ATTEMPTS`
- Increase `GEMINI_RETRY_INITIAL_DELAY_MS`
- Check for non-retryable errors being classified as retryable

### Not retrying when expected
- Check error classification in logs
- Verify error contains expected status/message
- Ensure not hitting `maxRetries` limit

## References

- [AWS Architecture Blog: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [HTTP 429 Too Many Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429)
