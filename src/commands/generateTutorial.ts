import type { ProcessingResult, ProcessingStage } from '../types.js';
import { runGeminiMediaTask } from '../utils/geminiMediaTask.js';
import { ensureNotAborted } from '../utils/gemini.js';
import { promises as fs } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '../../prompts/tutorial-generation.txt');

// Default fallback prompt - used when tutorial-generation.txt cannot be loaded
// This ensures the command always works even if the prompt file is missing
const DEFAULT_TUTORIAL_PROMPT = `Create a comprehensive tutorial based on this video/audio content.

Include:
- Overview and learning objectives
- Key topics and concepts with timestamps [hh:mm:ss]
- Step-by-step explanations
- Important takeaways
- Suggested exercises or practice points

Structure the tutorial clearly with sections and subsections.`;

interface GenerateTutorialOptions {
  onStatus?: (status: string) => void;
  onProgressChunk?: (chunk: string) => void;
  onStageChange?: (stage: ProcessingStage) => void;
  signal?: AbortSignal;
}

export async function generateTutorial(
  filePath: string,
  options?: GenerateTutorialOptions
): Promise<ProcessingResult> {
  let promptText: string;

  // Attempt to load custom prompt, fall back to default if unavailable
  try {
    promptText = await fs.readFile(resolve(PROMPT_PATH), 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Emit warning but continue with fallback prompt
    const warningMessage = `Warning: Could not load custom prompt from ${PROMPT_PATH} (${message}). Using default prompt.`;
    if (options?.onStatus) {
      options.onStatus(warningMessage);
    } else {
      console.warn(warningMessage);
    }

    // Use the fallback prompt to ensure operation continues
    promptText = DEFAULT_TUTORIAL_PROMPT;
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
      onStageChange: options?.onStageChange,
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
