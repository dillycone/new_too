import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import mime from 'mime';
import type { ProcessingResult } from '../types.js';
import { isS3Url, downloadFromS3, cleanupTempFile } from '../utils/s3.js';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { parseNumber, DEFAULT_READY_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS, sleep, ensureNotAborted, extractFileName, waitForGeminiFileReady } from '../utils/gemini.js';

interface TranscribeOptions {
  onStatus?: (status: string) => void;
  onProgressChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Transcribes audio/video files using Google Gemini AI
 * Supports both local file paths and S3 URLs (s3:// or https://s3...)
 * @param filePath - Path to the audio/video file or S3 URL
 * @returns Promise with processing result
 */
export async function transcribe(
  filePath: string,
  options?: TranscribeOptions
): Promise<ProcessingResult> {
  let tempFilePath: string | null = null;
  let actualFilePath: string = filePath;

  try {
    ensureNotAborted(options?.signal);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const ai = new GoogleGenAI({ apiKey });

    const emitStatus = (message: string) => {
      if (options?.onStatus) {
        options.onStatus(message);
      } else {
        console.log(message);
      }
    };

    const emitProgress = (chunk: string) => {
      if (options?.onProgressChunk) {
        options.onProgressChunk(chunk);
      } else {
        process.stdout.write(chunk);
      }
    };

    emitStatus('Transcription Process:');
    emitStatus(`File: ${filePath}`);

    if (isS3Url(filePath)) {
      emitStatus('Detected S3 URL');
      emitStatus('Downloading from S3...');
      ensureNotAborted(options?.signal);
      tempFilePath = await downloadFromS3(filePath);
      ensureNotAborted(options?.signal);
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

    ensureNotAborted(options?.signal);
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

    await waitForGeminiFileReady(ai, fileName, emitStatus, DEFAULT_READY_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS, options?.signal);

    ensureNotAborted(options?.signal);
    emitStatus('Processing audio with Gemini AI...');
    emitStatus('Generating transcript...');

    const config = {
      thinkingConfig: {
        thinkingBudget: 32768,
      },
    };

    const model = 'gemini-2.5-pro';
    const fileUri = uploadedFile.uri;
    const fileMimeType = uploadedFile.mimeType || mimeType;

    if (!fileUri) {
      throw new Error('Failed to get file URI from Gemini Files API');
    }

    const contents = createUserContent([
      createPartFromUri(fileUri, fileMimeType),
      `Transcribe the audio verbatim.
       - Include timestamps at least every sentence as [hh:mm:ss].
       - Diarize speakers as "Speaker 1:", "Speaker 2:" (infer new speaker on voice change).
       - Do NOT summarize.`,
    ]);

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    let fullTranscript = '';
    for await (const chunk of response) {
      ensureNotAborted(options?.signal);
      if (chunk.text) {
        emitProgress(chunk.text);
        fullTranscript += chunk.text;
      }
    }

    emitStatus('✓ Transcription complete!');

    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }

    return {
      success: true,
      message: `Transcription completed successfully for: ${filePath}`,
      data: fullTranscript,
    };
  } catch (error) {
    if (options?.onStatus) {
      options.onStatus(`✗ Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.error('\n  ✗ Transcription failed:', error);
    }

    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }

    return {
      success: false,
      message: `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
