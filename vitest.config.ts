import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Use Node environment for testing CLI tools
    environment: 'node',

    // Global test setup
    setupFiles: ['./tests/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/__tests__/**',
        'scripts/**',
        'vitest.config.ts',
        'src/index.tsx', // Main entry point - integration tested
        'src/wizard.tsx', // Wizard UI - integration tested
      ],
      // Overall coverage thresholds
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },

    // Coverage thresholds per pattern
    // Utils should have higher coverage (90%)
    coverageThreshold: {
      './src/utils/**/*.ts': {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      './src/formatters/**/*.ts': {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },

    // Test match patterns
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],

    // Globals
    globals: true,

    // Test timeout
    testTimeout: 30000,

    // Mock reset
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
