import type { ProcessingResult } from '../types.js';
import { runGeminiMediaTask } from '../utils/geminiMediaTask.js';
import { ensureNotAborted } from '../utils/gemini.js';
import { promises as fs } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '../../prompts/tutorial-generation.txt');

interface GenerateTutorialOptions {
  onStatus?: (status: string) => void;
  onProgressChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function generateTutorial(
  filePath: string,
  options?: GenerateTutorialOptions
): Promise<ProcessingResult> {
  let promptText: string;

  try {
    promptText = await fs.readFile(resolve(PROMPT_PATH), 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to load tutorial generation prompt from ${PROMPT_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    ensureNotAborted(options?.signal);

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

    const tutorial = await runGeminiMediaTask({
      filePath,
      signal: options?.signal,
      onStatus: emitStatus,
      onProgressChunk: emitProgress,
      processingStatus: 'Processing content with Gemini AI...',
      generatingStatus: 'Generating tutorial...',
      completionStatus: '✓ Tutorial generation complete!',
      buildContents: async ({ fileUri, fileMimeType, createPartFromUri, createUserContent }) =>
        createUserContent([
          createPartFromUri(fileUri, fileMimeType),
          promptText,
        ]),
    });

    return {
      success: true,
      message: `Tutorial generated successfully from: ${filePath}`,
      data: tutorial,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options?.onStatus) {
      options.onStatus(`✗ Tutorial generation failed: ${message}`);
    } else {
      console.error('\n  ✗ Tutorial generation failed:', error);
    }

    return {
      success: false,
      message: `Tutorial generation failed: ${message}`,
    };
  }
}
