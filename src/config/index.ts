import { ZodError } from 'zod';
import { configSchema, envSchema, type Config } from './schema.js';
import { ConfigValidationError, ConfigNotLoadedError } from './errors.js';

/**
 * Singleton configuration instance
 */
let configInstance: Config | null = null;

/**
 * Loads and validates configuration from environment variables
 * @throws {ConfigValidationError} If validation fails
 */
export function loadConfig(): Config {
  try {
    // First validate that we have the raw environment variables we need
    const rawEnv = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_READY_TIMEOUT_MS: process.env.GEMINI_READY_TIMEOUT_MS,
      GEMINI_POLL_INTERVAL_MS: process.env.GEMINI_POLL_INTERVAL_MS,
      GEMINI_RETRY_MAX_ATTEMPTS: process.env.GEMINI_RETRY_MAX_ATTEMPTS,
      GEMINI_RETRY_INITIAL_DELAY_MS: process.env.GEMINI_RETRY_INITIAL_DELAY_MS,
      GEMINI_RETRY_MAX_DELAY_MS: process.env.GEMINI_RETRY_MAX_DELAY_MS,
      GEMINI_RETRY_BACKOFF_MULTIPLIER: process.env.GEMINI_RETRY_BACKOFF_MULTIPLIER,
      GEMINI_CIRCUIT_BREAKER_THRESHOLD: process.env.GEMINI_CIRCUIT_BREAKER_THRESHOLD,
      GEMINI_CIRCUIT_BREAKER_TIMEOUT_MS: process.env.GEMINI_CIRCUIT_BREAKER_TIMEOUT_MS,
      AWS_REGION: process.env.AWS_REGION,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      AWS_PROFILE: process.env.AWS_PROFILE,
      VERBOSE: process.env.VERBOSE,
      MAX_INPUT_MB: process.env.MAX_INPUT_MB,
      WIZARD_STDERR_MIRROR_TTY: process.env.WIZARD_STDERR_MIRROR_TTY,
      OUTPUT_FORMAT: process.env.OUTPUT_FORMAT,
      CACHE_ENABLED: process.env.CACHE_ENABLED,
      CACHE_MAX_SIZE_MB: process.env.CACHE_MAX_SIZE_MB,
      CACHE_MAX_ENTRIES: process.env.CACHE_MAX_ENTRIES,
      CACHE_TTL_HOURS: process.env.CACHE_TTL_HOURS,
    };

    // Validate environment variables exist
    const validatedEnv = envSchema.parse(rawEnv);

    // Transform environment variables into structured config (as strings for schema parsing)
    const configInput = {
      gemini: {
        apiKey: validatedEnv.GEMINI_API_KEY,
        readyTimeoutMs: validatedEnv.GEMINI_READY_TIMEOUT_MS,
        pollIntervalMs: validatedEnv.GEMINI_POLL_INTERVAL_MS,
        retryMaxAttempts: validatedEnv.GEMINI_RETRY_MAX_ATTEMPTS,
        retryInitialDelayMs: validatedEnv.GEMINI_RETRY_INITIAL_DELAY_MS,
        retryMaxDelayMs: validatedEnv.GEMINI_RETRY_MAX_DELAY_MS,
        retryBackoffMultiplier: validatedEnv.GEMINI_RETRY_BACKOFF_MULTIPLIER,
        circuitBreakerThreshold: validatedEnv.GEMINI_CIRCUIT_BREAKER_THRESHOLD,
        circuitBreakerTimeoutMs: validatedEnv.GEMINI_CIRCUIT_BREAKER_TIMEOUT_MS,
      },
      aws: {
        region: validatedEnv.AWS_REGION || validatedEnv.AWS_DEFAULT_REGION,
        profile: validatedEnv.AWS_PROFILE,
      },
      app: {
        verbose: validatedEnv.VERBOSE,
        maxInputMb: validatedEnv.MAX_INPUT_MB,
        wizardStderrMirrorTty: validatedEnv.WIZARD_STDERR_MIRROR_TTY,
        outputFormat: validatedEnv.OUTPUT_FORMAT,
      },
      cache: {
        enabled: validatedEnv.CACHE_ENABLED,
        maxSizeMb: validatedEnv.CACHE_MAX_SIZE_MB,
        maxEntries: validatedEnv.CACHE_MAX_ENTRIES,
        ttlHours: validatedEnv.CACHE_TTL_HOURS,
      },
    };

    // Validate and transform the complete config structure
    configInstance = configSchema.parse(configInput);
    return configInstance;
  } catch (error) {
    if (error instanceof ZodError) {
      throw ConfigValidationError.fromZodError(error);
    }
    throw error;
  }
}

/**
 * Gets the current configuration instance
 * @throws {ConfigNotLoadedError} If config hasn't been loaded yet
 */
export function getConfig(): Config {
  if (!configInstance) {
    throw new ConfigNotLoadedError();
  }
  return configInstance;
}

/**
 * Checks if configuration has been loaded
 */
export function isConfigLoaded(): boolean {
  return configInstance !== null;
}

/**
 * Resets the configuration instance (primarily for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Export error classes for convenience
 */
export { ConfigValidationError, ConfigNotLoadedError } from './errors.js';

/**
 * Export types
 */
export type { Config } from './schema.js';
