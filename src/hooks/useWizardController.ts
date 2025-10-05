import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';
import type { WizardScreen, OperationType, ProcessingResult } from '../types.js';
import { subscribeToConsole } from '../utils/consoleCapture.js';
import { startStderrCapture } from '../utils/stderrCapture.js';
import { createTranscriptBuffer, createStatusBuffer } from '../utils/bufferedState.js';
import { finalizeProcessing } from '../utils/postProcessResult.js';
import { isS3Url } from '../utils/s3Url.js';

const isVerbose = /^(1|true|yes)$/i.test(String(process.env.VERBOSE ?? ''));
const MAX_CONSOLE_LINES = isVerbose ? 10 : 4;
const DEFAULT_SPINNER_SYMBOL = '⠋';
const spinnerFrames = [DEFAULT_SPINNER_SYMBOL, '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const createInitialTranscriptState = () => ({
  lines: [] as string[],
  buffer: '',
});

export interface WizardControllerState {
  screen: WizardScreen;
  selectedOption: OperationType | null;
  isProcessing: boolean;
  spinnerSymbol: string;
  statusMessages: string[];
  consoleMessages: string[];
  transcriptLines: string[];
  previewLines: string[] | null;
  result: ProcessingResult | null;
  showProcessingConsoleTail: boolean;
  isVerbose: boolean;
  handleMenuSelect: (option: OperationType) => void;
  handleFileSubmit: (filePath: string) => Promise<void>;
  resetWizard: () => void;
}

export const useWizardController = (): WizardControllerState => {
  const { exit } = useApp();

  const [screen, setScreen] = useState<WizardScreen>('menu');
  const [selectedOption, setSelectedOption] = useState<OperationType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [consoleMessages, setConsoleMessages] = useState<string[]>([]);
  const [transcriptState, setTranscriptState] = useState<{ lines: string[]; buffer: string }>(
    createInitialTranscriptState
  );
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [previewLines, setPreviewLines] = useState<string[] | null>(null);

  const isProcessingRef = useRef(false);
  const stderrBufferRef = useRef<string[]>([]);
  const stopStderrCaptureRef = useRef<null | (() => void)>(null);
  const abortRef = useRef<AbortController | null>(null);

  const spinnerSymbol = spinnerFrames[spinnerIndex % spinnerFrames.length] ?? DEFAULT_SPINNER_SYMBOL;

  useEffect(() => {
    isProcessingRef.current = screen === 'processing';
  }, [screen]);

  useEffect(() => {
    if (screen !== 'processing') {
      setSpinnerIndex(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setSpinnerIndex(prev => (prev + 1) % spinnerFrames.length);
    }, 80);

    return () => {
      clearInterval(interval);
    };
  }, [screen]);

  const resetWizard = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setScreen('menu');
    setSelectedOption(null);
    setIsProcessing(false);
    setResult(null);
    setStatusMessages([]);
    setConsoleMessages([]);
    setTranscriptState(createInitialTranscriptState());
    setPreviewLines(null);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToConsole(
      ({ level, message }) => {
        const prefix = level === 'log' || level === 'info' ? 'info' : level;
        const formatted = `[${prefix.toUpperCase()}] ${message}`;
        setConsoleMessages(prev => [...prev.slice(-(MAX_CONSOLE_LINES - 1)), formatted]);
      },
      {
        predicate: entry => {
          const processing = isProcessingRef.current;
          if (!isVerbose && processing && (entry.level === 'log' || entry.level === 'info')) {
            return false;
          }
          return true;
        },
      }
    );

    return unsubscribe;
  }, []);

  const handleMenuSelect = useCallback((option: OperationType) => {
    setSelectedOption(option);
    setScreen('fileInput');
  }, []);

  const handleFileSubmit = useCallback(
    async (filePath: string) => {
      if (!selectedOption) {
        return;
      }

      setScreen('processing');
      setIsProcessing(true);
      setStatusMessages([]);
      setTranscriptState(createInitialTranscriptState());
      setConsoleMessages([]);
      setResult(null);
      setPreviewLines(null);

      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const transcriptBuffer = createTranscriptBuffer(setTranscriptState, {
        flushIntervalMs: 150,
        maxLines: 3,
      });
      const enqueueTranscriptChunk = transcriptBuffer.enqueue;
      const flushTranscript = transcriptBuffer.flush;

      const statusBuffer = createStatusBuffer(setStatusMessages, {
        flushIntervalMs: 200,
        maxEntries: 3,
      });
      const enqueueStatus = statusBuffer.enqueue;
      const flushStatus = statusBuffer.flush;

      // Start capturing stderr to avoid TUI corruption from SDKs
      stderrBufferRef.current = [];
      const stopCapture = startStderrCapture((chunk) => {
        const lines = chunk.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          stderrBufferRef.current = [...stderrBufferRef.current, ...lines].slice(-10);
        }
      });
      stopStderrCaptureRef.current = stopCapture;

      let processResult: ProcessingResult;

      try {
        const appendConsoleMessage = (message: string) => {
          setConsoleMessages(prev => [...prev.slice(-(MAX_CONSOLE_LINES - 1)), message]);
        };

        const handleSuccess = async (
          baseResult: ProcessingResult,
          extension: string,
          fallbackBaseName: string,
          artifactLabel: string
        ): Promise<ProcessingResult> => {
          if (!baseResult.success || !baseResult.data) {
            return baseResult;
          }

          const shouldAttemptPresign = isVerbose && isS3Url(filePath);
          const generatePresignedUrl = shouldAttemptPresign
            ? (await import('../utils/s3.js')).generatePresignedUrl
            : undefined;

          return finalizeProcessing(baseResult, {
            filePath,
            data: baseResult.data,
            fallbackBaseName,
            extension,
            artifactLabel,
            verbose: isVerbose,
            enqueueStatus,
            appendConsoleMessage,
            generatePresignedUrl,
            shouldAttemptPresign,
          });
        };

        if (selectedOption === 'transcribe') {
          const { transcribe } = await import('../commands/transcribe.js');
          const baseResult = await transcribe(filePath, {
            onStatus: enqueueStatus,
            onProgressChunk: enqueueTranscriptChunk,
            signal,
          });

          processResult = await handleSuccess(baseResult, '.transcript.txt', 'transcript', 'transcript');
        } else if (selectedOption === 'generateTutorial') {
          const { generateTutorial } = await import('../commands/generateTutorial.js');
          const baseResult = await generateTutorial(filePath, {
            onStatus: enqueueStatus,
            onProgressChunk: enqueueTranscriptChunk,
            signal,
          });

          processResult = await handleSuccess(baseResult, '.tutorial.md', 'tutorial', 'tutorial');
        } else {
          throw new Error('Invalid operation type');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        processResult = {
          success: false,
          message: `Error: ${errorMessage}`,
          error: errorMessage,
        };
      } finally {
        // Ensure final flush and cleanup before toggling processing state
        flushTranscript();
        transcriptBuffer.dispose();

        flushStatus();
        statusBuffer.dispose();

        // Stop stderr capture and publish buffered stderr lines
        if (stopStderrCaptureRef.current) {
          stopStderrCaptureRef.current();
          stopStderrCaptureRef.current = null;
        }
        if (stderrBufferRef.current.length > 0) {
          setConsoleMessages(prev => {
            const formatted = stderrBufferRef.current.map(l => `[STDERR] ${l}`);
            return [...prev.slice(-5), ...formatted].slice(-10);
          });
        }

        abortRef.current = null;
        setIsProcessing(false);
      }

      setResult(processResult);
      setScreen('complete');
    },
    [selectedOption]
  );

  useInput(
    (input, key) => {
      if (screen !== 'processing') {
        return;
      }

      if (key.escape || (input && input.toLowerCase() === 'q')) {
        abortRef.current?.abort();
      }
    },
    { isActive: screen === 'processing' }
  );

  useInput(
    (input, key) => {
      if (screen !== 'complete') {
        return;
      }

      const normalizedInput = (input || '').trim().toLowerCase();

      if (key.return || normalizedInput === 'm') {
        resetWizard();
        return;
      }

      if (normalizedInput === 'o' && result?.data) {
        const lines = result.data
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .slice(0, 3);
        setPreviewLines(lines.length > 0 ? lines : ['(transcript is empty)']);
        return;
      }

      if (normalizedInput === 'q') {
        exit();
      }
    },
    { isActive: screen === 'complete' }
  );

  return {
    screen,
    selectedOption,
    isProcessing,
    spinnerSymbol,
    statusMessages,
    consoleMessages,
    transcriptLines: transcriptState.lines,
    previewLines,
    result,
    showProcessingConsoleTail: isVerbose && consoleMessages.length > 0,
    isVerbose,
    handleMenuSelect,
    handleFileSubmit,
    resetWizard,
  };
};
