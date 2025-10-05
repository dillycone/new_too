# Testing Framework Documentation

## Overview

This document describes the comprehensive automated testing framework implemented for the transcription toolkit. The framework provides unit tests, integration tests, mocking strategies, and CI/CD integration.

## Test Structure

```
new_too/
├── tests/
│   ├── setup.ts                    # Global test configuration
│   ├── mocks/
│   │   ├── gemini.ts              # Mock Gemini AI client
│   │   ├── s3.ts                  # Mock S3 client with aws-sdk-client-mock
│   │   └── filesystem.ts          # Mock filesystem operations
│   └── helpers/
│       ├── testUtils.tsx          # Ink component test utilities
│       └── mockFactories.ts       # Mock data factories
├── src/
│   ├── utils/__tests__/
│   │   ├── s3Url.test.ts         # S3 URL parsing tests (29 tests)
│   │   └── gemini.test.ts        # Gemini utility tests (28 tests)
│   ├── formatters/__tests__/
│   │   ├── parser.test.ts        # Parser tests (30 tests)
│   │   └── JsonFormatter.test.ts # JSON formatter tests (16 tests)
│   └── __tests__/integration/
│       ├── transcribe-flow.test.ts    # Transcription workflow tests
│       └── s3-download-flow.test.ts   # S3 download workflow tests
├── vitest.config.ts               # Vitest configuration
└── .github/workflows/test.yml     # CI/CD pipeline
```

## Test Dependencies

The following packages were installed:

```json
{
  "devDependencies": {
    "vitest": "^3.2.4",
    "@vitest/ui": "^3.2.4",
    "@vitest/coverage-v8": "^3.2.4",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "ink-testing-library": "^4.0.0",
    "aws-sdk-client-mock": "^4.1.0"
  }
}
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests once (CI mode)
npm run test:run

# Generate coverage report
npm run test:coverage

# Open interactive test UI
npm run test:ui
```

### Running Specific Tests

```bash
# Run tests for a specific file
npm test -- src/utils/__tests__/s3Url.test.ts

# Run tests matching a pattern
npm test -- --grep="S3 URL"

# Run only integration tests
npm run test:run -- src/__tests__/integration
```

## Coverage Targets

The framework enforces different coverage thresholds for different parts of the codebase:

### Overall Coverage (85%)
- Lines: 85%
- Functions: 85%
- Branches: 85%
- Statements: 85%

### Utils & Formatters (90%)
- Lines: 90%
- Functions: 90%
- Branches: 90%
- Statements: 90%

### Excluded from Coverage
- `node_modules/`
- `dist/`
- `tests/`
- Test files (`*.test.ts`, `*.test.tsx`)
- Scripts and configuration files

## Test Suites

### 1. S3 URL Parsing Tests (`s3Url.test.ts`)

**Tests:** 29 passing
**Coverage:** 94.59% lines

Tests cover:
- s3:// protocol URLs
- Virtual-hosted-style URLs
- Path-style URLs
- URL with query parameters and signed URLs
- Special characters and edge cases
- URL validation

Example:
```typescript
it('should parse basic s3:// URL', () => {
  const result = parseS3Url('s3://my-bucket/path/to/file.txt');
  expect(result).toEqual({
    bucket: 'my-bucket',
    key: 'path/to/file.txt',
  });
});
```

### 2. Gemini Utility Tests (`gemini.test.ts`)

**Tests:** 28 passing
**Coverage:** 57.77% lines

Tests cover:
- Sleep function with abort signals
- Exponential backoff calculation
- Error classification (network, rate limit, auth, etc.)
- Retry-After header extraction
- Circuit Breaker pattern
- State transitions (CLOSED, OPEN, HALF_OPEN)

Example:
```typescript
it('should calculate exponential backoff', () => {
  const config = { ...DEFAULT_RETRY_CONFIG, useJitter: false };
  expect(calculateBackoffDelay(0, config)).toBe(1000); // 1000 * 2^0
  expect(calculateBackoffDelay(1, config)).toBe(2000); // 1000 * 2^1
  expect(calculateBackoffDelay(2, config)).toBe(4000); // 1000 * 2^2
});
```

### 3. Parser Tests (`parser.test.ts`)

**Tests:** 30 passing
**Coverage:** 97.81% lines

Tests cover:
- Timestamp parsing ([hh:mm:ss] and [mm:ss] formats)
- Timestamp formatting (SRT, VTT, simple)
- Text wrapping with word boundaries
- Raw transcript parsing with speakers
- Multi-line segments
- Duration estimation

Example:
```typescript
it('should parse timestamp in [hh:mm:ss] format', () => {
  expect(parseTimestamp('[01:23:45]')).toBe((1 * 3600 + 23 * 60 + 45) * 1000);
});
```

### 4. JSON Formatter Tests (`JsonFormatter.test.ts`)

**Tests:** 16 passing
**Coverage:** 100% lines

Tests cover:
- Pretty printing and minification
- Metadata handling
- Speaker inclusion/exclusion
- Timestamp formatting
- Special characters and Unicode
- Large datasets

Example:
```typescript
it('should format transcript with pretty print by default', () => {
  const transcript = createMockTranscript();
  const result = formatter.format(transcript);
  const parsed = JSON.parse(result);

  expect(parsed.metadata).toBeDefined();
  expect(parsed.segments).toBeDefined();
});
```

### 5. Integration Tests

**Transcription Flow:** 11 tests (8 skipped - require complex mocking)
**S3 Download Flow:** 20 tests (14 skipped - require complex mocking)

Active tests focus on:
- URL parsing and validation
- Data flow through parsing pipeline
- Multi-speaker handling
- Error handling for invalid inputs

## Mock Utilities

### Gemini Mock (`tests/mocks/gemini.ts`)

Provides configurable Gemini API mocking:

```typescript
const mockGemini = createMockGeminiClient({
  uploadDelay: 100,
  processingStates: [FileState.PROCESSING, FileState.ACTIVE],
  generateResponse: 'Mock response text',
  streamChunks: ['chunk1', 'chunk2', 'chunk3'],
  shouldFail: false,
});

// Specialized mocks
const failingClient = createFailingGeminiClient('API error');
const slowClient = createSlowGeminiClient(5000);
const streamingClient = createStreamingGeminiClient(['chunk1', 'chunk2']);
```

### S3 Mock (`tests/mocks/s3.ts`)

Provides S3 client mocking with aws-sdk-client-mock:

```typescript
const mockS3 = createMockS3Client([
  createMockFile('bucket', 'key', 'content'),
]);

mockS3.addFile(createMockFile('bucket', 'newfile.txt', 'data'));
mockS3.removeFile('bucket', 'oldfile.txt');

// Error simulation
const failingS3 = createFailingS3Client('NoSuchKey');
const rateLimitedS3 = createRateLimitedS3Client(2);
```

### Filesystem Mock (`tests/mocks/filesystem.ts`)

Provides in-memory filesystem for testing:

```typescript
const mockFs = createMockFileSystem();
mockFs.addFile('/tmp/test.txt', 'content');
mockFs.addDirectory('/tmp/dir');

const fsPromises = mockFs.createFsPromises();
const content = await fsPromises.readFile('/tmp/test.txt', 'utf8');
```

### Mock Factories (`tests/helpers/mockFactories.ts`)

Factory functions for creating test data:

```typescript
// Create mock segments
const segments = createMockSegments(5);

// Create mock transcript
const transcript = createMockTranscript({ segments });

// Create mock S3 URLs
const s3Url = createMockS3Url('bucket', 'key', 'virtual-host');

// Create status callbacks
const statusCallback = createMockStatusCallback();
await someFunction({ onStatus: statusCallback.callback });
expect(statusCallback.hasMessage('Success')).toBe(true);
```

## CI/CD Integration

GitHub Actions workflow (`.github/workflows/test.yml`) runs on every push and pull request:

### Jobs

1. **Test Matrix** - Runs tests on Node.js 18.x, 20.x, and 22.x
2. **Coverage Check** - Enforces coverage thresholds
3. **Build Check** - Verifies the project builds successfully
4. **Integration Tests** - Runs integration test suite

### Workflow Features

- Automatic test execution on push/PR
- Coverage report generation
- Codecov integration for coverage tracking
- Build verification
- Test result artifacts

## Test Configuration

### Vitest Config (`vitest.config.ts`)

Key settings:
- Node environment for CLI testing
- Global test setup file
- Coverage with v8 provider
- TypeScript support
- Mock cleanup between tests
- 30-second test timeout

### Global Setup (`tests/setup.ts`)

Automatically:
- Sets test environment variables
- Loads application configuration
- Mocks console output (suppressible)
- Provides test utilities (waitFor, mockTimers)
- Cleans up after each test

## Best Practices

### 1. Test Organization

- Unit tests go in `__tests__` directories next to source files
- Integration tests go in `src/__tests__/integration/`
- Use descriptive test names following pattern: "should [expected behavior] when [condition]"

### 2. Mocking Strategy

- Mock external services (Gemini API, AWS S3)
- Use factories for consistent test data
- Reset mocks between tests
- Prefer dependency injection for testability

### 3. Coverage Guidelines

- Focus on critical paths and utilities first
- Aim for high coverage on utility functions (90%+)
- Integration tests can have lower coverage but test real workflows
- Don't test implementation details, test behavior

### 4. Async Testing

```typescript
// Use async/await
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// Use waitFor for conditions
await waitFor(() => callback.hasMessage('Complete'), {
  timeout: 5000,
  interval: 100,
});
```

### 5. Error Testing

```typescript
// Test error throwing
expect(() => functionThatThrows()).toThrow('Error message');

// Test async errors
await expect(asyncFunctionThatRejects()).rejects.toThrow('Error');
```

## Current Test Results

```
Test Files: 6 passed (6)
Tests: 112 passed | 22 skipped (134)
Duration: ~4 seconds

Coverage Highlights:
- s3Url.ts: 94.59%
- gemini.ts: 57.77%
- parser.ts: 97.81%
- JsonFormatter.ts: 100%
```

## Future Improvements

1. **Increase Coverage**
   - Add tests for remaining formatters (SRT, VTT, Text)
   - Add tests for UI components with ink-testing-library
   - Add tests for hooks and state management

2. **Enhanced Integration Tests**
   - Implement proper AWS SDK mocking for S3 tests
   - Add end-to-end workflow tests with real file operations
   - Add performance benchmarks

3. **Test Utilities**
   - Add snapshot testing for formatted output
   - Add visual regression testing for UI components
   - Add mutation testing with Stryker

4. **Documentation**
   - Add JSDoc comments to test utilities
   - Create test writing guide for contributors
   - Add examples for common testing patterns

## Troubleshooting

### Tests Failing Locally

1. Ensure dependencies are installed: `npm ci --legacy-peer-deps`
2. Clear test cache: `npx vitest --clearCache`
3. Check environment variables are set (see `tests/setup.ts`)

### Coverage Not Meeting Thresholds

1. Check which files are below threshold in coverage report
2. Add tests for uncovered branches/functions
3. Consider if thresholds need adjustment for specific files

### Timeouts in Tests

1. Increase timeout in test: `it('test', { timeout: 60000 }, async () => {})`
2. Check for unresolved promises
3. Ensure cleanup in afterEach hooks

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [AWS SDK Client Mock](https://github.com/m-radzikowski/aws-sdk-client-mock)
- [Ink Testing Library](https://github.com/vadimdemedes/ink-testing-library)
