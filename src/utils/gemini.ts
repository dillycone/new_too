import { GoogleGenAI, FileState } from '@google/genai';

export const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DEFAULT_READY_TIMEOUT_MS = parseNumber(process.env.GEMINI_READY_TIMEOUT_MS, 15 * 60 * 1000);
export const DEFAULT_POLL_INTERVAL_MS = parseNumber(process.env.GEMINI_POLL_INTERVAL_MS, 2000);

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolveSleep, rejectSleep) => {
    if (signal?.aborted) {
      rejectSleep(new Error('Operation aborted'));
      return;
    }

    let timeout: NodeJS.Timeout;

    const onAbort = () => {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      rejectSleep(new Error('Operation aborted'));
    };

    timeout = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolveSleep();
    }, ms);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

export const ensureNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }
};

export const extractFileName = (uri?: string | null): string | null => {
  if (!uri) {
    return null;
  }

  const match = uri.match(/files\/[a-z0-9\-]+/i);
  return match ? match[0] : null;
};

export async function waitForGeminiFileReady(
  ai: GoogleGenAI,
  fileName: string,
  emitStatus: (message: string) => void,
  timeoutMs: number = DEFAULT_READY_TIMEOUT_MS,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  signal?: AbortSignal
): Promise<void> {
  const normalizedName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  const startTime = Date.now();
  let lastState: FileState | undefined;

  emitStatus('Waiting for Gemini to finish processing the uploaded file...');

  while (Date.now() - startTime < timeoutMs) {
    ensureNotAborted(signal);

    const file = await ai.files.get({ name: normalizedName });
    const state = file.state as FileState | undefined;

    if (state !== lastState && state) {
      emitStatus(`Gemini file state: ${state}`);
      lastState = state;
    }

    if (state === FileState.ACTIVE) {
      return;
    }

    if (state === FileState.FAILED) {
      const errorMessage = file.error?.message;
      throw new Error(
        errorMessage ? `Gemini failed to process the uploaded file: ${errorMessage}` : 'Gemini failed to process the uploaded file.'
      );
    }

    await sleep(pollIntervalMs, signal);
  }

  throw new Error('Timed out waiting for Gemini to process the uploaded file.');
}
