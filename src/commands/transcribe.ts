import type { ProcessingResult } from '../types.js';
import { runGeminiMediaTask } from '../utils/geminiMediaTask.js';
import { ensureNotAborted } from '../utils/gemini.js';

interface TranscribeOptions {
  onStatus?: (status: string) => void;
  onProgressChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

const TRANSCRIBE_PROMPT = `Transcribe the audio verbatim.
       - Include timestamps at least every sentence as [hh:mm:ss].
       - Diarize speakers as "Speaker 1:", "Speaker 2:" (infer new speaker on voice change).
       - Do NOT summarize.`;

export async function transcribe(
  filePath: string,
  options?: TranscribeOptions
): Promise<ProcessingResult> {
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
      processingStatus: 'Processing audio with Gemini AI...',
      generatingStatus: 'Generating transcript...',
      completionStatus: '✓ Transcription complete!',
      buildContents: async ({ fileUri, fileMimeType, createPartFromUri, createUserContent }) =>
        createUserContent([
          createPartFromUri(fileUri, fileMimeType),
          TRANSCRIBE_PROMPT,
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
