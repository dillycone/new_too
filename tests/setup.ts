/**
 * Global test setup file
 * Runs before all tests to configure the testing environment
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_PROFILE = 'test-profile';
process.env.CACHE_ENABLED = 'true';
process.env.CACHE_MAX_SIZE_MB = '100';
process.env.CACHE_MAX_ENTRIES = '50';
process.env.CACHE_TTL_HOURS = '24';

// Load configuration for tests that need it
import { loadConfig, resetConfig } from '../src/config/index.js';
try {
  loadConfig();
} catch {
  // Config may fail to load in some tests, that's ok
}

// Mock console methods to reduce noise in tests
// Tests can override these mocks when they need to test console output
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

// Suppress console output by default
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

// Restore console for specific tests that need it
export const restoreConsole = () => {
  global.console = {
    ...console,
    ...originalConsole,
  };
};

// Mock timers utility
export const mockTimers = () => {
  vi.useFakeTimers();
  return {
    advanceTime: (ms: number) => vi.advanceTimersByTime(ms),
    runAll: () => vi.runAllTimers(),
    restore: () => vi.useRealTimers(),
  };
};

// Global test utilities
export const waitFor = async (
  callback: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> => {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await callback();
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
};

// Cleanup after each test
beforeEach(() => {
  // Clear all mocks
  vi.clearAllMocks();

  // Reload config for each test
  resetConfig();
  try {
    loadConfig();
  } catch {
    // Config may fail to load in some tests, that's ok
  }
});

afterEach(() => {
  // Restore all mocks
  vi.restoreAllMocks();

  // Clear all timers
  vi.clearAllTimers();

  // Ensure real timers are restored
  vi.useRealTimers();
});

// Global error handler for unhandled rejections in tests
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection in test:', error);
  throw error;
});
