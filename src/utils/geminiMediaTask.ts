import { GoogleGenAI, createPartFromUri, createUserContent } from '@google/genai';
import mime from 'mime';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { isS3Url, downloadFromS3, cleanupTempFile } from './s3.js';
import { DEFAULT_READY_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS, ensureNotAborted, extractFileName, waitForGeminiFileReady } from './gemini.js';

interface GeminiMediaTaskOptions {
  filePath: string;
  signal?: AbortSignal | undefined;
  onStatus?: ((status: string) => void) | undefined;
  onProgressChunk?: ((chunk: string) => void) | undefined;
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
  processingStatus,
  generatingStatus,
  completionStatus,
  buildContents,
  model = 'gemini-2.5-pro',
  thinkingBudget = 32768,
}: GeminiMediaTaskOptions): Promise<string> {
  const emitStatus = emitStatusFactory(onStatus);
  const emitProgress = emitProgressFactory(onProgressChunk);

  ensureNotAborted(signal);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const ai = new GoogleGenAI({ apiKey });

  let tempFilePath: string | null = null;
  let actualFilePath = filePath;

  try {
    if (isS3Url(filePath)) {
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

    await waitForGeminiFileReady(ai, fileName, emitStatus, DEFAULT_READY_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS, signal);

    ensureNotAborted(signal);
    emitStatus(processingStatus);
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

    let fullOutput = '';
    for await (const chunk of response) {
      ensureNotAborted(signal);
      if (chunk.text) {
        emitProgress(chunk.text);
        fullOutput += chunk.text;
      }
    }

    emitStatus(completionStatus);

    return fullOutput;
  } finally {
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
}
