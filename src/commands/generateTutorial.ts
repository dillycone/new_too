import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import mime from 'mime';
import type { ProcessingResult } from '../types.js';
import { isS3Url, downloadFromS3, cleanupTempFile } from '../utils/s3.js';
import { promises as fs } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_READY_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS, ensureNotAborted, extractFileName, waitForGeminiFileReady } from '../utils/gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '../../prompts/tutorial-generation.txt');

interface GenerateTutorialOptions {
  onStatus?: (status: string) => void;
  onProgressChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Generates a comprehensive tutorial from audio/video files using Google Gemini AI
 * Supports both local file paths and S3 URLs (s3:// or https://s3...)
 * @param filePath - Path to the audio/video file or S3 URL
 * @returns Promise with processing result
 */
export async function generateTutorial(
  filePath: string,
  options?: GenerateTutorialOptions
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

    emitStatus('Tutorial Generation Process:');
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
    emitStatus('Processing content with Gemini AI...');
    emitStatus('Generating tutorial...');

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

    // Load prompt from file
    let promptText: string;
    try {
      promptText = await fs.readFile(PROMPT_PATH, 'utf8');
    } catch (error) {
      throw new Error(`Failed to load tutorial generation prompt from ${PROMPT_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const contents = createUserContent([
      createPartFromUri(fileUri, fileMimeType),
      promptText,
    ]);

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    let fullTutorial = '';
    for await (const chunk of response) {
      ensureNotAborted(options?.signal);
      if (chunk.text) {
        emitProgress(chunk.text);
        fullTutorial += chunk.text;
      }
    }

    emitStatus('✓ Tutorial generation complete!');

    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }

    return {
      success: true,
      message: `Tutorial generated successfully from: ${filePath}`,
      data: fullTutorial,
    };
  } catch (error) {
    if (options?.onStatus) {
      options.onStatus(`✗ Tutorial generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.error('\n  ✗ Tutorial generation failed:', error);
    }

    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }

    return {
      success: false,
      message: `Tutorial generation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
