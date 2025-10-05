/**
 * Error-path tests for runGeminiMediaTask
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempFile: string;

beforeEach(async () => {
  tempFile = join(tmpdir(), `gmerr-${Math.random().toString(36).slice(2)}.txt`);
  await fs.writeFile(tempFile, 'dummy');
});

afterEach(async () => {
  try { await fs.unlink(tempFile); } catch {}
  vi.resetModules();
});

it('fails when upload throws', async () => {
  vi.doMock('@google/genai', () => ({
    GoogleGenAI: vi.fn(() => ({
      files: {
        upload: vi.fn(async () => { throw new Error('upload failed'); }),
      },
      models: {},
    })),
    createPartFromUri: vi.fn(),
    createUserContent: vi.fn(),
    FileState: { PROCESSING: 'PROCESSING', ACTIVE: 'ACTIVE', FAILED: 'FAILED' },
  }));

  const { runGeminiMediaTask } = await import('../geminiMediaTask.js');
  await expect(
    runGeminiMediaTask({
      filePath: tempFile,
      processingStatus: 'Processing...',
      generatingStatus: 'Generating...',
      completionStatus: 'Done',
      buildContents: () => ({ role: 'user', parts: [] } as any),
    })
  ).rejects.toThrow('upload failed');
});

it('fails when file processing reaches FAILED state', async () => {
  vi.doMock('@google/genai', () => ({
    GoogleGenAI: vi.fn(() => ({
      files: {
        upload: vi.fn(async () => ({
          name: 'files/id',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/id',
          mimeType: 'audio/mpeg',
        })),
        get: vi.fn(async () => ({ state: 'FAILED', error: { message: 'bad file' } })),
      },
      models: {},
    })),
    createPartFromUri: vi.fn(),
    createUserContent: vi.fn(),
    FileState: { PROCESSING: 'PROCESSING', ACTIVE: 'ACTIVE', FAILED: 'FAILED' },
  }));

  const { loadConfig } = await import('../../config/index.js');
  loadConfig();
  const { runGeminiMediaTask } = await import('../geminiMediaTask.js');
  await expect(
    runGeminiMediaTask({
      filePath: tempFile,
      processingStatus: 'Processing...',
      generatingStatus: 'Generating...',
      completionStatus: 'Done',
      buildContents: () => ({ role: 'user', parts: [] } as any),
      retryConfig: { maxRetries: 0 },
    })
  ).rejects.toThrow(/failed to process/i);
});

it('aborts during streaming and rejects with Operation aborted', async () => {
  vi.useFakeTimers();
  vi.doMock('@google/genai', () => ({
    GoogleGenAI: vi.fn(() => ({
      files: {
        upload: vi.fn(async () => ({
          name: 'files/id',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/id',
          mimeType: 'audio/mpeg',
        })),
        get: vi.fn(async () => ({ state: 'ACTIVE' })),
      },
      models: {
        generateContentStream: vi.fn(async function* () {
          yield { text: 'chunk-1' } as any;
          // Simulate delay before next chunk
          await new Promise((r) => setTimeout(r, 10));
          yield { text: 'chunk-2' } as any;
        }),
      },
    })),
    createPartFromUri: vi.fn((uri: string, mimeType: string) => ({ fileData: { fileUri: uri, mimeType } })),
    createUserContent: vi.fn((parts: any[]) => ({ role: 'user', parts })),
    FileState: { PROCESSING: 'PROCESSING', ACTIVE: 'ACTIVE', FAILED: 'FAILED' },
  }));

  const { loadConfig } = await import('../../config/index.js');
  loadConfig();
  const { runGeminiMediaTask } = await import('../geminiMediaTask.js');
  const controller = new AbortController();

  const promise = runGeminiMediaTask({
    filePath: tempFile,
    processingStatus: 'Processing...',
    generatingStatus: 'Generating...',
    completionStatus: 'Done',
    buildContents: () => ({ role: 'user', parts: [] } as any),
    signal: controller.signal,
  });

  // Abort during streaming delay
  vi.advanceTimersByTime(1);
  controller.abort();
  vi.advanceTimersByTime(20);

  await expect(promise).rejects.toThrow('Operation aborted');
  vi.useRealTimers();
});
