/**
 * Mock data factories for testing
 * Provides consistent mock data generation
 */

import type { TranscriptSegment, ParsedTranscript } from '../../src/formatters/types.js';
import type { ProcessingResult } from '../../src/types.js';

/**
 * Creates a mock transcript segment
 */
export function createMockSegment(
  overrides: Partial<TranscriptSegment> = {}
): TranscriptSegment {
  return {
    index: 0,
    startMs: 0,
    endMs: 5000,
    text: 'This is a test segment.',
    speaker: 'Speaker 1',
    ...overrides,
  };
}

/**
 * Creates multiple mock segments
 */
export function createMockSegments(count: number): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < count; i++) {
    segments.push({
      index: i,
      startMs: i * 5000,
      endMs: (i + 1) * 5000,
      text: `This is segment ${i + 1}.`,
      speaker: i % 2 === 0 ? 'Speaker 1' : 'Speaker 2',
    });
  }

  return segments;
}

/**
 * Creates a mock parsed transcript
 */
export function createMockTranscript(
  overrides: Partial<ParsedTranscript> = {}
): ParsedTranscript {
  const segments = overrides.segments || createMockSegments(3);

  return {
    segments,
    rawText: segments.map((s) => `[${formatMs(s.startMs)}] ${s.speaker}: ${s.text}`).join('\n'),
    metadata: {
      durationMs: Math.max(...segments.map((s) => s.endMs)),
      speakers: ['Speaker 1', 'Speaker 2'],
      createdAt: new Date().toISOString(),
      ...overrides.metadata,
    },
    ...overrides,
  };
}

/**
 * Creates a mock processing result
 */
export function createMockProcessingResult(
  success: boolean = true,
  data?: string
): ProcessingResult {
  if (success) {
    return {
      success: true,
      message: 'Processing completed successfully',
      data: data || 'Mock result data',
    };
  }

  return {
    success: false,
    message: 'Processing failed',
  };
}

/**
 * Creates a mock raw transcript text
 */
export function createMockRawTranscript(segments: number = 3): string {
  const lines: string[] = [];

  for (let i = 0; i < segments; i++) {
    const timestamp = formatMs(i * 5000);
    const speaker = i % 2 === 0 ? 'Speaker 1' : 'Speaker 2';
    lines.push(`[${timestamp}] ${speaker}: This is segment ${i + 1}.`);
  }

  return lines.join('\n');
}

/**
 * Creates a mock S3 URL
 */
export function createMockS3Url(
  bucket: string = 'test-bucket',
  key: string = 'test-file.mp3',
  style: 's3' | 'virtual-host' | 'path-style' = 's3'
): string {
  switch (style) {
    case 's3':
      return `s3://${bucket}/${key}`;
    case 'virtual-host':
      return `https://${bucket}.s3.us-east-1.amazonaws.com/${key}`;
    case 'path-style':
      return `https://s3.us-east-1.amazonaws.com/${bucket}/${key}`;
  }
}

/**
 * Creates a mock file path
 */
export function createMockFilePath(filename: string = 'test.mp3'): string {
  return `/tmp/mock-${Date.now()}-${filename}`;
}

/**
 * Creates a mock Gemini file URI
 */
export function createMockGeminiUri(fileId: string = 'mock-file-id'): string {
  return `https://generativelanguage.googleapis.com/v1beta/files/${fileId}`;
}

/**
 * Creates mock environment variables
 */
export function createMockEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    GEMINI_API_KEY: 'test-api-key',
    AWS_REGION: 'us-east-1',
    AWS_PROFILE: 'test-profile',
    ...overrides,
  };
}

/**
 * Creates a mock AbortSignal
 */
export function createMockAbortSignal(aborted: boolean = false): AbortSignal {
  const controller = new AbortController();
  if (aborted) {
    controller.abort();
  }
  return controller.signal;
}

/**
 * Formats milliseconds to timestamp string [hh:mm:ss]
 */
function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

/**
 * Creates mock status callback
 */
export function createMockStatusCallback() {
  const messages: string[] = [];

  return {
    callback: (message: string) => {
      messages.push(message);
    },
    getMessages: () => messages,
    clear: () => {
      messages.length = 0;
    },
    hasMessage: (text: string) => messages.some((m) => m.includes(text)),
  };
}

/**
 * Creates mock progress callback
 */
export function createMockProgressCallback() {
  const chunks: string[] = [];

  return {
    callback: (chunk: string) => {
      chunks.push(chunk);
    },
    getChunks: () => chunks,
    getFullText: () => chunks.join(''),
    clear: () => {
      chunks.length = 0;
    },
  };
}

/**
 * Creates a mock streaming response
 */
export function createMockStreamChunks(text: string, chunkSize: number = 10): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}
