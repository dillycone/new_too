import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';
import type { WizardScreen, OperationType, ProcessingResult, ProcessingStage, BatchFile, BatchQueueState, BatchConfiguration } from '../types.js';
import { subscribeToConsole } from '../utils/consoleCapture.js';
import { startStderrCapture } from '../utils/stderrCapture.js';
import { createTranscriptBuffer, createStatusBuffer } from '../utils/bufferedState.js';
import { finalizeProcessing } from '../utils/postProcessResult.js';
import { isS3Url } from '../utils/s3Url.js';
import { getConfig } from '../config/index.js';
import { calculateEstimatedRemaining } from '../config/processingStages.js';
import { nanoid } from 'nanoid';

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
  currentStage: ProcessingStage | null;
  completedStages: ProcessingStage[];
  elapsedTime: number;
  estimatedRemaining: number | undefined;
  handleMenuSelect: (option: OperationType) => void;
  handleFileSubmit: (filePath: string) => Promise<void>;
  resetWizard: () => void;
  // Batch processing state
  batchFiles: string[];
  batchConfig: BatchConfiguration | null;
  batchQueueState: BatchQueueState;
  batchOverallProgress: number;
  batchIsPaused: boolean;
  handleBatchFilesSubmit: (files: string[]) => void;
  handleBatchConfigSubmit: (config: BatchConfiguration) => Promise<void>;
  handleBatchPause: () => void;
  handleBatchResume: () => void;
  handleBatchCancel: () => void;
}

export const useWizardController = (): WizardControllerState => {
  const { exit } = useApp();
  const config = getConfig();
  const isVerbose = config.app.verbose;
  const MAX_CONSOLE_LINES = isVerbose ? 10 : 4;

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

  // Stage tracking state
  const [currentStage, setCurrentStage] = useState<ProcessingStage | null>(null);
  const [completedStages, setCompletedStages] = useState<ProcessingStage[]>([]);
  const [processingStartTime, setProcessingStartTime] = useState<number>(0);
  const [stageStartTime, setStageStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [estimatedRemaining, setEstimatedRemaining] = useState<number | undefined>(undefined);

  const isProcessingRef = useRef(false);
  const stderrBufferRef = useRef<string[]>([]);
  const stopStderrCaptureRef = useRef<null | (() => void)>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Batch processing state
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  const [batchConfig, setBatchConfig] = useState<BatchConfiguration | null>(null);
  const [batchQueueState, setBatchQueueState] = useState<BatchQueueState>({
    files: [],
    currentlyProcessing: [],
    completed: [],
    failed: [],
    cancelled: [],
  });
  const [batchOverallProgress, setBatchOverallProgress] = useState(0);
  const [batchIsPaused, setBatchIsPaused] = useState(false);
  const batchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const batchProcessingRef = useRef(false);

  const spinnerSymbol = spinnerFrames[spinnerIndex % spinnerFrames.length] ?? DEFAULT_SPINNER_SYMBOL;

  useEffect(() => {
    isProcessingRef.current = screen === 'processing';
  }, [screen]);

  // Timer for elapsed time and estimated remaining
  useEffect(() => {
    if (!isProcessing || !processingStartTime) {
      return undefined;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - processingStartTime;
      setElapsedTime(elapsed);

      // Calculate estimated remaining if we have a current stage
      if (currentStage && stageStartTime) {
        const estimated = calculateEstimatedRemaining(
          currentStage,
          completedStages,
          stageStartTime
        );
        setEstimatedRemaining(estimated);
      }
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [isProcessing, processingStartTime, currentStage, completedStages, stageStartTime]);

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
    setCurrentStage(null);
    setCompletedStages([]);
    setProcessingStartTime(0);
    setStageStartTime(0);
    setElapsedTime(0);
    setEstimatedRemaining(undefined);
  }, []);

  // Stage transition function
  const transitionToStage = useCallback((stage: ProcessingStage) => {
    setCurrentStage(prevStage => {
      // Mark previous stage as completed if it exists
      if (prevStage) {
        setCompletedStages(prev => [...prev, prevStage]);
      }
      return stage;
    });
    setStageStartTime(Date.now());
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
    if (option === 'batchTranscribe') {
      setScreen('batchFileInput');
    } else {
      setScreen('fileInput');
    }
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

      // Initialize stage tracking
      const startTime = Date.now();
      setProcessingStartTime(startTime);
      setStageStartTime(startTime);
      setCurrentStage('initializing');
      setCompletedStages([]);
      setElapsedTime(0);
      setEstimatedRemaining(undefined);

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

          // Import formatters to get types
          const { FormatterRegistry } = await import('../formatters/index.js');

          // Determine output format from config
          const configuredFormat = config.app.outputFormat;
          const outputFormat = FormatterRegistry.isFormatSupported(configuredFormat)
            ? (configuredFormat as any)
            : 'txt';

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
            outputFormat,
            formatSource: filePath,
          });
        };

        if (selectedOption === 'transcribe') {
          const { transcribe } = await import('../commands/transcribe.js');
          const baseResult = await transcribe(filePath, {
            onStatus: enqueueStatus,
            onProgressChunk: enqueueTranscriptChunk,
            onStageChange: transitionToStage,
            signal,
          });

          processResult = await handleSuccess(baseResult, '.transcript.txt', 'transcript', 'transcript');
        } else if (selectedOption === 'generateTutorial') {
          const { generateTutorial } = await import('../commands/generateTutorial.js');
          const baseResult = await generateTutorial(filePath, {
            onStatus: enqueueStatus,
            onProgressChunk: enqueueTranscriptChunk,
            onStageChange: transitionToStage,
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
        // Transition to finalizing stage
        transitionToStage('finalizing');

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

      // Mark as complete
      transitionToStage('complete');
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

  // Batch processing handlers
  const handleBatchFilesSubmit = useCallback((files: string[]) => {
    setBatchFiles(files);
    setScreen('batchConfig');
  }, []);

  const generateOutputFileName = useCallback((
    originalPath: string,
    index: number,
    pattern: 'original' | 'timestamp' | 'sequential'
  ): string => {
    const pathParts = originalPath.split('/');
    const fileName = pathParts[pathParts.length - 1] || 'file';
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const dir = pathParts.slice(0, -1).join('/');

    let suffix = '';
    if (pattern === 'timestamp') {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0]?.replace('T', '_') || '';
      suffix = `.${timestamp}`;
    } else if (pattern === 'sequential') {
      suffix = `.${String(index + 1).padStart(3, '0')}`;
    }

    return `${dir}/${baseName}${suffix}.transcript.txt`;
  }, []);

  const processSingleFile = useCallback(async (
    file: BatchFile,
    config: BatchConfiguration,
    index: number
  ): Promise<void> => {
    const fileAbortController = new AbortController();
    batchAbortControllersRef.current.set(file.id, fileAbortController);

    setBatchQueueState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === file.id
          ? { ...f, status: 'processing' as const, startTime: Date.now(), progress: 0 }
          : f
      ),
    }));

    try {
      const { transcribe } = await import('../commands/transcribe.js');

      // Simple progress tracking
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        currentProgress = Math.min(currentProgress + 10, 90);
        setBatchQueueState(prev => ({
          ...prev,
          files: prev.files.map(f =>
            f.id === file.id ? { ...f, progress: currentProgress } : f
          ),
        }));
      }, 1000);

      const baseResult = await transcribe(file.filePath, {
        onStatus: () => {}, // Silent for batch processing
        onProgressChunk: () => {},
        onStageChange: () => {},
        signal: fileAbortController.signal,
      });

      clearInterval(progressInterval);

      if (!baseResult.success) {
        throw new Error(baseResult.error || 'Transcription failed');
      }

      // Finalize the output
      const shouldAttemptPresign = isVerbose && isS3Url(file.filePath);
      const generatePresignedUrl = shouldAttemptPresign
        ? (await import('../utils/s3.js')).generatePresignedUrl
        : undefined;

      const { FormatterRegistry } = await import('../formatters/index.js');
      const configuredFormat = config.app?.outputFormat || getConfig().app.outputFormat;
      const outputFormat = FormatterRegistry.isFormatSupported(configuredFormat)
        ? (configuredFormat as any)
        : 'txt';

      const outputFileName = generateOutputFileName(file.filePath, index, config.namingPattern);

      const processResult = await finalizeProcessing(baseResult, {
        filePath: file.filePath,
        data: baseResult.data!,
        fallbackBaseName: outputFileName.replace(/\.[^.]+$/, ''),
        extension: '.transcript.txt',
        artifactLabel: 'transcript',
        verbose: false,
        enqueueStatus: () => {},
        appendConsoleMessage: () => {},
        generatePresignedUrl,
        shouldAttemptPresign,
        outputFormat,
        formatSource: file.filePath,
      });

      setBatchQueueState(prev => ({
        ...prev,
        files: prev.files.map(f =>
          f.id === file.id
            ? {
                ...f,
                status: 'completed' as const,
                progress: 100,
                endTime: Date.now(),
                result: processResult,
              }
            : f
        ),
        currentlyProcessing: prev.currentlyProcessing.filter(id => id !== file.id),
        completed: [...prev.completed, file.id],
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isCancelled = errorMessage.includes('abort') || errorMessage.includes('cancel');

      setBatchQueueState(prev => ({
        ...prev,
        files: prev.files.map(f =>
          f.id === file.id
            ? {
                ...f,
                status: isCancelled ? ('cancelled' as const) : ('failed' as const),
                progress: 100,
                endTime: Date.now(),
                error: errorMessage,
              }
            : f
        ),
        currentlyProcessing: prev.currentlyProcessing.filter(id => id !== file.id),
        ...(isCancelled
          ? { cancelled: [...prev.cancelled, file.id] }
          : { failed: [...prev.failed, file.id] }),
      }));

      if (!config.continueOnError && !isCancelled) {
        throw error;
      }
    } finally {
      batchAbortControllersRef.current.delete(file.id);
    }
  }, [generateOutputFileName, isVerbose]);

  const processNextInQueue = useCallback(async (config: BatchConfiguration): Promise<void> => {
    batchProcessingRef.current = true;

    // Process files with concurrency control
    const processQueue = async () => {
      const activeSlots = new Set<Promise<void>>();

      for (let i = 0; i < batchQueueState.files.length; i++) {
        const file = batchQueueState.files[i];
        if (!file) continue;

        // Wait if paused
        while (batchIsPaused && batchProcessingRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Stop if cancelled
        if (!batchProcessingRef.current) {
          break;
        }

        // Skip if already processed
        if (file.status !== 'pending') {
          continue;
        }

        // Wait for an available slot
        while (activeSlots.size >= config.concurrencyLimit) {
          await Promise.race(activeSlots);
        }

        // Add to currently processing
        setBatchQueueState(prev => ({
          ...prev,
          currentlyProcessing: [...prev.currentlyProcessing, file.id],
        }));

        // Start processing this file
        const processPromise = processSingleFile(file, config, i)
          .finally(() => {
            activeSlots.delete(processPromise);
          });

        activeSlots.add(processPromise);
      }

      // Wait for all remaining files to complete
      await Promise.all(activeSlots);
    };

    try {
      await processQueue();
    } finally {
      batchProcessingRef.current = false;
      setScreen('batchComplete');
    }
  }, [batchQueueState.files, batchIsPaused, processSingleFile]);

  // Update overall progress whenever queue state changes
  useEffect(() => {
    if (batchQueueState.files.length === 0) {
      setBatchOverallProgress(0);
      return;
    }

    const totalProgress = batchQueueState.files.reduce((sum, file) => sum + file.progress, 0);
    const overallProgress = totalProgress / batchQueueState.files.length;
    setBatchOverallProgress(overallProgress);
  }, [batchQueueState]);

  const handleBatchConfigSubmit = useCallback(async (config: BatchConfiguration) => {
    setBatchConfig(config);

    // Initialize queue state
    const initialFiles: BatchFile[] = batchFiles.map((filePath) => ({
      id: nanoid(),
      filePath,
      status: 'pending' as const,
      progress: 0,
    }));

    setBatchQueueState({
      files: initialFiles,
      currentlyProcessing: [],
      completed: [],
      failed: [],
      cancelled: [],
    });

    setBatchOverallProgress(0);
    setBatchIsPaused(false);
    setScreen('batchProcessing');

    // Start processing
    await processNextInQueue(config);
  }, [batchFiles, processNextInQueue]);

  const handleBatchPause = useCallback(() => {
    setBatchIsPaused(true);
  }, []);

  const handleBatchResume = useCallback(() => {
    setBatchIsPaused(false);
  }, []);

  const handleBatchCancel = useCallback(() => {
    // Abort all active file processing
    batchAbortControllersRef.current.forEach(controller => controller.abort());
    batchAbortControllersRef.current.clear();
    batchProcessingRef.current = false;

    // Mark remaining files as cancelled
    setBatchQueueState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.status === 'pending' || f.status === 'processing'
          ? { ...f, status: 'cancelled' as const, progress: 100 }
          : f
      ),
      currentlyProcessing: [],
      cancelled: [
        ...prev.cancelled,
        ...prev.files
          .filter(f => f.status === 'pending' || f.status === 'processing')
          .map(f => f.id),
      ],
    }));

    setScreen('batchComplete');
  }, []);

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
    currentStage,
    completedStages,
    elapsedTime,
    estimatedRemaining,
    handleMenuSelect,
    handleFileSubmit,
    resetWizard,
    // Batch processing
    batchFiles,
    batchConfig,
    batchQueueState,
    batchOverallProgress,
    batchIsPaused,
    handleBatchFilesSubmit,
    handleBatchConfigSubmit,
    handleBatchPause,
    handleBatchResume,
    handleBatchCancel,
  };
};
