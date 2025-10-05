import { GoogleGenAI, createPartFromUri, createUserContent } from '@google/genai';
import mime from 'mime';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { isS3Url, downloadFromS3, cleanupTempFile } from './s3.js';
import { ensureNotAborted, extractFileName, waitForGeminiFileReady, type RetryConfig } from './gemini.js';
import { getConfig } from '../config/index.js';
import { StreamingOutputManager } from './streamingOutput/index.js';
import type { StreamingOutputController } from './streamingOutput/index.js';
import type { ProcessingStage } from '../types.js';

interface GeminiMediaTaskOptions {
  filePath: string;
  signal?: AbortSignal | undefined;
  onStatus?: ((status: string) => void) | undefined;
  onProgressChunk?: ((chunk: string) => void) | undefined;
  onStageChange?: ((stage: ProcessingStage) => void) | undefined;
  processingStatus: string;
  generatingStatus: string;
  completionStatus: string;
  buildContents: (params: {
    fileUri: string;
    fileMimeType: string;
    createPartFromUri: typeof createPartFromUri;
    createUserContent: typeof createUserContent;
  }) => Promise<ReturnType<typeof createUserContent>> | ReturnType<typeof createUserContent>;
  model?: string | undefined;
  thinkingBudget?: number | undefined;
  retryConfig?: Partial<RetryConfig> | undefined;
  useStreaming?: boolean | undefined;
}

export interface GeminiMediaTaskResult {
  output: string;
  streamingManager?: StreamingOutputController;
}

const emitStatusFactory = (handler?: (status: string) => void) => (status: string) => {
  if (handler) {
    handler(status);
  } else {
    console.log(status);
  }
};

const emitProgressFactory = (handler?: (chunk: string) => void) => (chunk: string) => {
  if (handler) {
    handler(chunk);
  } else {
    process.stdout.write(chunk);
  }
};

export async function runGeminiMediaTask({
  filePath,
  signal,
  onStatus,
  onProgressChunk,
  onStageChange,
  processingStatus,
  generatingStatus,
  completionStatus,
  buildContents,
  model = 'gemini-2.5-pro',
  thinkingBudget = 32768,
  retryConfig,
  useStreaming = true,
}: GeminiMediaTaskOptions): Promise<string> {
  const emitStatus = emitStatusFactory(onStatus);
  const emitProgress = emitProgressFactory(onProgressChunk);

  ensureNotAborted(signal);

  const config = getConfig();
  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

  let tempFilePath: string | null = null;
  let actualFilePath = filePath;
  let streamingManager: StreamingOutputManager | null = null;

  try {
    if (isS3Url(filePath)) {
      onStageChange?.('downloading');
      emitStatus('Detected S3 URL');
      emitStatus('Downloading from S3...');
      ensureNotAborted(signal);
      tempFilePath = await downloadFromS3(filePath);
      ensureNotAborted(signal);
      actualFilePath = tempFilePath;
      emitStatus('Download complete');
    } else {
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`File not found or not readable: ${filePath}`);
      }
      actualFilePath = resolve(filePath);
    }

    ensureNotAborted(signal);
    onStageChange?.('uploading');
    emitStatus('Uploading to Gemini Files API...');

    const mimeType = mime.getType(actualFilePath) || 'application/octet-stream';

    const uploadedFile = await ai.files.upload({
      file: actualFilePath,
      config: { mimeType },
    });

    emitStatus('Upload complete');

    const fileName = uploadedFile.name ?? extractFileName(uploadedFile.uri);
    if (!fileName) {
      throw new Error('Failed to determine uploaded file name for Gemini polling.');
    }

    onStageChange?.('processing');
    await waitForGeminiFileReady(
      ai,
      fileName,
      emitStatus,
      config.gemini.readyTimeoutMs,
      config.gemini.pollIntervalMs,
      signal,
      retryConfig
    );

    ensureNotAborted(signal);
    emitStatus(processingStatus);

    onStageChange?.('generating');
    emitStatus(generatingStatus);

    const fileUri = uploadedFile.uri;
    if (!fileUri) {
      throw new Error('Failed to get file URI from Gemini Files API');
    }

    const contents = await buildContents({
      fileUri,
      fileMimeType: uploadedFile.mimeType || mimeType,
      createPartFromUri,
      createUserContent,
    });

    const response = await ai.models.generateContentStream({
      model,
      config: {
        thinkingConfig: {
          thinkingBudget,
        },
      },
      contents,
      ...(signal ? { signal } : {}),
    });

    // Initialize streaming manager if enabled
    if (useStreaming) {
      streamingManager = new StreamingOutputManager({
        verbose: false,
        onProgress: (progress) => {
          if (progress.mode === 'streaming' && progress.thresholdExceeded) {
            emitStatus(`[Memory] Switched to streaming mode (${formatBytes(progress.bytesWritten)})`);
          }
        },
      });
    }

    let fullOutput = '';
    for await (const chunk of response) {
      ensureNotAborted(signal);
      if (chunk.text) {
        emitProgress(chunk.text);

        // Use streaming manager if enabled, otherwise string concatenation
        if (streamingManager) {
          streamingManager.write(chunk.text);
        } else {
          fullOutput += chunk.text;
        }
      }
    }

    emitStatus(completionStatus);

    // Finalize output based on mode
    if (streamingManager) {
      fullOutput = await streamingManager.finalize();
      const progress = streamingManager.getProgress();
      if (progress.mode === 'streaming') {
        emitStatus(`[Memory] Processed ${formatBytes(progress.bytesWritten)} via streaming`);
      }
    }

    return fullOutput;
  } finally {
    // Cleanup streaming manager resources
    if (streamingManager) {
      streamingManager.dispose();
    }

    // Cleanup S3 temp file
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
