/**
 * Mock Gemini AI client for testing
 * Provides configurable responses for upload, generation, and streaming
 */

import { vi } from 'vitest';
import { FileState } from '@google/genai';

export interface MockGeminiFileResponse {
  name: string;
  uri: string;
  mimeType: string;
  state: FileState;
  sizeBytes?: number;
  error?: { message: string };
}

export interface MockGeminiOptions {
  uploadDelay?: number;
  processingStates?: FileState[];
  generateResponse?: string;
  streamChunks?: string[];
  shouldFail?: boolean;
  failureMessage?: string;
  stateTransitionDelay?: number;
}

/**
 * Creates a mock Gemini AI client with configurable behavior
 */
export function createMockGeminiClient(options: MockGeminiOptions = {}) {
  const {
    uploadDelay = 0,
    processingStates = [FileState.PROCESSING, FileState.ACTIVE],
    generateResponse = 'Mock transcription response',
    streamChunks = ['Mock ', 'stream ', 'response'],
    shouldFail = false,
    failureMessage = 'Mock Gemini error',
    stateTransitionDelay = 100,
  } = options;

  let currentStateIndex = 0;
  let uploadedFiles = new Map<string, MockGeminiFileResponse>();

  const mockFile: MockGeminiFileResponse = {
    name: 'files/mock-file-id',
    uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-file-id',
    mimeType: 'audio/mpeg',
    state: processingStates[0] || FileState.PROCESSING,
    sizeBytes: 1024,
  };

  // Mock files API
  const filesApi = {
    upload: vi.fn(async ({ file, config }: any) => {
      if (shouldFail) {
        throw new Error(failureMessage);
      }

      await new Promise((resolve) => setTimeout(resolve, uploadDelay));

      const uploadedFile = {
        ...mockFile,
        mimeType: config?.mimeType || mockFile.mimeType,
      };

      uploadedFiles.set(mockFile.name, uploadedFile);
      return { file: uploadedFile };
    }),

    get: vi.fn(async ({ name }: { name: string }) => {
      if (shouldFail) {
        throw new Error(failureMessage);
      }

      const file = uploadedFiles.get(name) || mockFile;

      // Simulate state transitions
      if (currentStateIndex < processingStates.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, stateTransitionDelay));
        currentStateIndex++;
        file.state = processingStates[currentStateIndex]!;
      }

      return file;
    }),

    delete: vi.fn(async ({ name }: { name: string }) => {
      uploadedFiles.delete(name);
      return { success: true };
    }),

    list: vi.fn(async () => {
      return {
        files: Array.from(uploadedFiles.values()),
      };
    }),
  };

  // Mock models API
  const modelsApi = {
    generateContent: vi.fn(async ({ contents, model }: any) => {
      if (shouldFail) {
        throw new Error(failureMessage);
      }

      return {
        response: {
          text: () => generateResponse,
          candidates: [
            {
              content: {
                parts: [{ text: generateResponse }],
              },
            },
          ],
        },
      };
    }),

    streamGenerateContent: vi.fn(async function* ({ contents, model }: any) {
      if (shouldFail) {
        throw new Error(failureMessage);
      }

      for (const chunk of streamChunks) {
        yield {
          text: () => chunk,
        };
      }
    }),
  };

  return {
    files: filesApi,
    models: {
      get: vi.fn((modelName: string) => ({
        generateContent: modelsApi.generateContent,
        streamGenerateContent: modelsApi.streamGenerateContent,
      })),
    },
    // Helpers for tests
    __test: {
      setCurrentState: (state: FileState) => {
        mockFile.state = state;
      },
      setProcessingStates: (states: FileState[]) => {
        processingStates.length = 0;
        processingStates.push(...states);
        currentStateIndex = 0;
      },
      getUploadedFiles: () => uploadedFiles,
      reset: () => {
        currentStateIndex = 0;
        uploadedFiles.clear();
        vi.clearAllMocks();
      },
    },
  };
}

/**
 * Creates a mock that simulates file processing failure
 */
export function createFailingGeminiClient(errorMessage = 'File processing failed') {
  return createMockGeminiClient({
    shouldFail: false, // Don't fail immediately
    processingStates: [FileState.PROCESSING, FileState.FAILED],
    failureMessage: errorMessage,
  });
}

/**
 * Creates a mock that simulates slow processing
 */
export function createSlowGeminiClient(processingTimeMs = 5000) {
  return createMockGeminiClient({
    processingStates: [FileState.PROCESSING, FileState.ACTIVE],
    stateTransitionDelay: processingTimeMs,
  });
}

/**
 * Creates a mock that simulates streaming responses
 */
export function createStreamingGeminiClient(chunks: string[]) {
  return createMockGeminiClient({
    streamChunks: chunks,
    processingStates: [FileState.ACTIVE], // Already processed
  });
}
