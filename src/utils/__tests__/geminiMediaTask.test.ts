/**
 * Tests for runGeminiMediaTask integration with mocked GoogleGenAI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGeminiMediaTask } from '../geminiMediaTask.js';

// Minimal mock of @google/genai used by runGeminiMediaTask
vi.mock('@google/genai', () => {
  const states = ['PROCESSING', 'ACTIVE'] as const;
  let getCalls = 0;

  return {
    GoogleGenAI: vi.fn(() => ({
      files: {
        upload: vi.fn(async ({ file, config }: any) => ({
          name: 'files/mock-id',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-id',
          mimeType: config?.mimeType || 'audio/mpeg',
        })),
        get: vi.fn(async () => ({
          state: states[Math.min(getCalls++, states.length - 1)],
        })),
      },
      models: {
        generateContentStream: vi.fn(async function* () {
          yield { text: 'Hello ' } as any;
          yield { text: 'World' } as any;
        }),
      },
    })),
    createPartFromUri: vi.fn((uri: string, mimeType: string) => ({ fileData: { fileUri: uri, mimeType } })),
    createUserContent: vi.fn((parts: any[]) => ({ role: 'user', parts })),
    FileState: {
      PROCESSING: 'PROCESSING',
      ACTIVE: 'ACTIVE',
      FAILED: 'FAILED',
    },
  };
});

describe('runGeminiMediaTask', () => {
  let tempFile: string;

  beforeEach(async () => {
    tempFile = join(tmpdir(), `gmtest-${Math.random().toString(36).slice(2)}.txt`);
    await fs.writeFile(tempFile, 'dummy');
  });

  afterEach(async () => {
    try { await fs.unlink(tempFile); } catch {}
  });

  it('uploads, waits for ready, and streams content', async () => {
    const statuses: string[] = [];
    const chunks: string[] = [];
    const stages: string[] = [];

    const output = await runGeminiMediaTask({
      filePath: tempFile,
      processingStatus: 'Processing...',
      generatingStatus: 'Generating...',
      completionStatus: 'Done',
      onStatus: (s) => statuses.push(s),
      onProgressChunk: (c) => chunks.push(c),
      onStageChange: (st) => stages.push(st),
      buildContents: ({ createPartFromUri, createUserContent, fileUri, fileMimeType }) =>
        createUserContent([createPartFromUri(fileUri, fileMimeType), 'prompt']),
      useStreaming: true,
    });

    expect(output).toBe('Hello World');
    expect(chunks.join('')).toBe('Hello World');
    expect(statuses.some((s) => s.includes('Uploading'))).toBe(true);
    expect(statuses.some((s) => s.includes('Processing')) || statuses.some((s) => s.includes('Gemini file state'))).toBe(true);
    expect(stages).toContain('uploading');
    expect(stages).toContain('processing');
    expect(stages).toContain('generating');
  });
});
