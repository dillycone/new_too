import type { Dispatch, SetStateAction } from 'react';

interface TranscriptBufferOptions {
  flushIntervalMs?: number;
  maxLines?: number;
}

interface StatusBufferOptions {
  flushIntervalMs?: number;
  maxEntries?: number;
}

export interface TranscriptBufferController {
  enqueue: (chunk: string) => void;
  flush: () => void;
  dispose: () => void;
}

export interface StatusBufferController {
  enqueue: (message: string) => void;
  flush: () => void;
  dispose: () => void;
}

export const createTranscriptBuffer = (
  updateState: Dispatch<SetStateAction<{ lines: string[]; buffer: string }>>,
  options?: TranscriptBufferOptions
): TranscriptBufferController => {
  const flushInterval = options?.flushIntervalMs ?? 150;
  const maxLines = options?.maxLines ?? 3;

  let pendingChunk = '';
  let flushTimer: NodeJS.Timeout | null = null;

  const clearTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    if (!pendingChunk) {
      clearTimer();
      return;
    }

    updateState(prev => {
      const combined = prev.buffer + pendingChunk;
      const segments = combined.split(/\r?\n/);
      const remainder = segments.pop() ?? '';
      const completedLines = segments.filter(line => line.trim().length > 0);
      const updatedLines = [...prev.lines, ...completedLines].slice(-maxLines);
      return { lines: updatedLines, buffer: remainder };
    });

    pendingChunk = '';
    clearTimer();
  };

  const enqueue = (chunk: string) => {
    pendingChunk += chunk;
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(flush, flushInterval);
  };

  const dispose = () => {
    clearTimer();
    pendingChunk = '';
  };

  return {
    enqueue,
    flush,
    dispose,
  };
};

export const createStatusBuffer = (
  updateState: Dispatch<SetStateAction<string[]>>,
  options?: StatusBufferOptions
): StatusBufferController => {
  const flushInterval = options?.flushIntervalMs ?? 200;
  const maxEntries = options?.maxEntries ?? 3;

  let pending: string[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const clearTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    if (pending.length === 0) {
      clearTimer();
      return;
    }

    updateState(prev => {
      const updated = [...prev, ...pending];
      return updated.slice(-maxEntries);
    });

    pending = [];
    clearTimer();
  };

  const enqueue = (message: string) => {
    pending.push(message);
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(flush, flushInterval);
  };

  const dispose = () => {
    clearTimer();
    pending = [];
  };

  return {
    enqueue,
    flush,
    dispose,
  };
};
