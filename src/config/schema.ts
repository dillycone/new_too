import { z } from 'zod';

/**
 * Helper to parse boolean-like environment variables
 */
const booleanString = () =>
  z
    .string()
    .optional()
    .default('false')
    .transform((val) => /^(1|true|yes)$/i.test(val || ''));

/**
 * Helper to parse numeric environment variables with defaults
 */
const numericString = (defaultValue: number) =>
  z
    .string()
    .optional()
    .default(String(defaultValue))
    .transform((val) => {
      if (val === undefined) return defaultValue;
      const parsed = Number(val);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    });

/**
 * Gemini API configuration schema
 */
const geminiConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1, 'GEMINI_API_KEY is required and cannot be empty')
    .describe('Google Gemini API key'),
  readyTimeoutMs: numericString(15 * 60 * 1000).describe(
    'Timeout for waiting for Gemini file processing (default: 15 minutes)'
  ),
  pollIntervalMs: numericString(2000).describe(
    'Polling interval for checking Gemini file status (default: 2 seconds)'
  ),
  retryMaxAttempts: numericString(5).describe(
    'Maximum number of retry attempts for Gemini API calls (default: 5)'
  ),
  retryInitialDelayMs: numericString(1000).describe(
    'Initial delay in milliseconds before first retry (default: 1000ms)'
  ),
  retryMaxDelayMs: numericString(30000).describe(
    'Maximum delay between retries in milliseconds (default: 30000ms)'
  ),
  retryBackoffMultiplier: numericString(2).describe(
    'Multiplier for exponential backoff (default: 2)'
  ),
  circuitBreakerThreshold: numericString(3).describe(
    'Number of failures before circuit breaker opens (default: 3)'
  ),
  circuitBreakerTimeoutMs: numericString(60000).describe(
    'Circuit breaker timeout in milliseconds before attempting reset (default: 60000ms)'
  ),
});

/**
 * AWS configuration schema
 */
const awsConfigSchema = z.object({
  region: z
    .string()
    .optional()
    .default('us-east-1')
    .describe('AWS region (default: us-east-1)'),
  profile: z
    .string()
    .optional()
    .describe('AWS profile name for credentials (optional)'),
});

/**
 * Cache configuration schema
 */
const cacheConfigSchema = z.object({
  enabled: booleanString().describe('Enable S3 download cache (default: true)'),
  maxSizeMb: numericString(500).describe(
    'Maximum cache size in MB (default: 500MB)'
  ),
  maxEntries: numericString(200).describe(
    'Maximum number of cached entries (default: 200)'
  ),
  ttlHours: numericString(24).describe(
    'Time-to-live for cache entries in hours (default: 24)'
  ),
});

/**
 * Application settings schema
 */
const appConfigSchema = z.object({
  verbose: booleanString().describe('Enable verbose logging'),
  maxInputMb: numericString(100).describe(
    'Maximum input file size in MB (default: 100)'
  ),
  wizardStderrMirrorTty: booleanString().describe(
    'Force mirroring stderr to TTY in wizard mode'
  ),
  outputFormat: z
    .string()
    .optional()
    .default('txt')
    .describe('Default output format for transcripts: txt, json, srt, or vtt (default: txt)'),
});

/**
 * Complete configuration schema
 */
export const configSchema = z.object({
  gemini: geminiConfigSchema,
  aws: awsConfigSchema,
  app: appConfigSchema,
  cache: cacheConfigSchema,
});

/**
 * Environment variables schema - maps env vars to config structure
 */
export const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_READY_TIMEOUT_MS: z.string().optional(),
  GEMINI_POLL_INTERVAL_MS: z.string().optional(),
  GEMINI_RETRY_MAX_ATTEMPTS: z.string().optional(),
  GEMINI_RETRY_INITIAL_DELAY_MS: z.string().optional(),
  GEMINI_RETRY_MAX_DELAY_MS: z.string().optional(),
  GEMINI_RETRY_BACKOFF_MULTIPLIER: z.string().optional(),
  GEMINI_CIRCUIT_BREAKER_THRESHOLD: z.string().optional(),
  GEMINI_CIRCUIT_BREAKER_TIMEOUT_MS: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_DEFAULT_REGION: z.string().optional(),
  AWS_PROFILE: z.string().optional(),
  VERBOSE: z.string().optional(),
  MAX_INPUT_MB: z.string().optional(),
  WIZARD_STDERR_MIRROR_TTY: z.string().optional(),
  OUTPUT_FORMAT: z.string().optional(),
  CACHE_ENABLED: z.string().optional(),
  CACHE_MAX_SIZE_MB: z.string().optional(),
  CACHE_MAX_ENTRIES: z.string().optional(),
  CACHE_TTL_HOURS: z.string().optional(),
});

/**
 * TypeScript type for the complete configuration
 */
export type Config = z.infer<typeof configSchema>;

/**
 * TypeScript type for environment variables
 */
export type EnvVars = z.infer<typeof envSchema>;
