import type { ProcessingResult, ProcessingStage } from '../types.js';
import { runGeminiMediaTask } from '../utils/geminiMediaTask.js';
import { ensureNotAborted } from '../utils/gemini.js';
import { promises as fs } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, '../../prompts/transcription.txt');

// Default fallback prompt - used when transcription.txt cannot be loaded
// This ensures the command always works even if the prompt file is missing
const DEFAULT_TRANSCRIPTION_PROMPT = `Transcribe the audio verbatim.
- Include timestamps at least every sentence as [hh:mm:ss].
- Diarize speakers as "Speaker 1:", "Speaker 2:" (infer new speaker on voice change).
- Do NOT summarize.
`;

interface TranscribeOptions {
  onStatus?: (status: string) => void;
  onProgressChunk?: (chunk: string) => void;
  onStageChange?: (stage: ProcessingStage) => void;
  signal?: AbortSignal;
}

export async function transcribe(
  filePath: string,
  options?: TranscribeOptions
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
    promptText = DEFAULT_TRANSCRIPTION_PROMPT;
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

    emitStatus('Transcription Process:');
    emitStatus(`File: ${filePath}`);

    const transcript = await runGeminiMediaTask({
      filePath,
      signal: options?.signal,
      onStatus: emitStatus,
      onProgressChunk: emitProgress,
      onStageChange: options?.onStageChange,
      processingStatus: 'Processing audio with Gemini AI...',
      generatingStatus: 'Generating transcript...',
      completionStatus: '✓ Transcription complete!',
      buildContents: async ({ fileUri, fileMimeType, createPartFromUri, createUserContent }) =>
        createUserContent([
          createPartFromUri(fileUri, fileMimeType),
          promptText,
        ]),
    });

    return {
      success: true,
      message: `Transcription completed successfully for: ${filePath}`,
      data: transcript,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options?.onStatus) {
      options.onStatus(`✗ Transcription failed: ${message}`);
    } else {
      console.error('\n  ✗ Transcription failed:', error);
    }

    return {
      success: false,
      message: `Transcription failed: ${message}`,
    };
  }
}
