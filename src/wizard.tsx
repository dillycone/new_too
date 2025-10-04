import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { writeFileSync } from 'node:fs';
import { basename, extname, resolve as resolvePath } from 'node:path';
import { Menu } from './components/Menu.js';
import { FileInput } from './components/FileInput.js';
import { transcribe } from './commands/transcribe.js';
import { generateTutorial } from './commands/generateTutorial.js';
import type { WizardScreen, OperationType, ProcessingResult } from './types.js';
import { subscribeToConsole } from './utils/consoleCapture.js';
import { startStderrCapture } from './utils/stderrCapture.js';
import { generatePresignedUrl, isS3Url } from './utils/s3.js';

const isVerbose = /^(1|true|yes)$/i.test(String(process.env.VERBOSE ?? ''));
const MAX_CONSOLE_LINES = isVerbose ? 10 : 4;
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const createInitialTranscriptState = () => ({
  lines: [] as string[],
  buffer: '',
});

export const Wizard: React.FC = () => {
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
  const { exit } = useApp();

  const isProcessingRef = useRef(false);
  const stderrBufferRef = useRef<string[]>([]);
  const stopStderrCaptureRef = useRef<null | (() => void)>(null);
  const abortRef = useRef<AbortController | null>(null);
  const spinnerSymbol = spinnerFrames[spinnerIndex % spinnerFrames.length];
  useEffect(() => {
    isProcessingRef.current = (screen === 'processing');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'processing') {
      setSpinnerIndex(0);
      return;
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

  const handleMenuSelect = (option: OperationType) => {
    setSelectedOption(option);
    setScreen('fileInput');
  };

  const handleFileSubmit = async (filePath: string) => {
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

    // Throttled transcript buffering
    let pendingTranscriptChunk = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_INTERVAL_MS = 150;

    const flushTranscript = () => {
      if (!pendingTranscriptChunk) return;
      setTranscriptState(prev => {
        const combined = prev.buffer + pendingTranscriptChunk;
        const segments = combined.split(/\r?\n/);
        const remainder = segments.pop() ?? '';
        const completedLines = segments.filter(line => line.trim().length > 0);
        const updatedLines = [...prev.lines, ...completedLines].slice(-3);
        return { lines: updatedLines, buffer: remainder };
      });
      pendingTranscriptChunk = '';
      flushTimer = null;
    };

    const enqueueTranscriptChunk = (chunk: string) => {
      pendingTranscriptChunk += chunk;
      if (flushTimer) return;
      flushTimer = setTimeout(flushTranscript, FLUSH_INTERVAL_MS);
    };

    // Throttled status buffering
    let pendingStatus: string[] = [];
    let statusFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const FLUSH_STATUS_MS = 200;

    const flushStatus = () => {
      if (pendingStatus.length === 0) return;
      setStatusMessages(prev => {
        const updated = [...prev, ...pendingStatus];
        return updated.slice(-3);
      });
      pendingStatus = [];
      statusFlushTimer = null;
    };

    const enqueueStatus = (message: string) => {
      pendingStatus.push(message);
      if (statusFlushTimer) return;
      statusFlushTimer = setTimeout(flushStatus, FLUSH_STATUS_MS);
    };

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
      if (selectedOption === 'transcribe') {
        processResult = await transcribe(filePath, {
          onStatus: enqueueStatus,
          onProgressChunk: enqueueTranscriptChunk,
          signal,
        });

        if (processResult.success && processResult.data) {
          const base = isS3Url(filePath) ? 'transcript' : basename(filePath, extname(filePath));
          const outputPath = resolvePath(process.cwd(), `${base}.transcript.txt`);
          let updatedResult: ProcessingResult = { ...processResult };

          try {
            writeFileSync(outputPath, processResult.data, 'utf8');
            updatedResult = { ...updatedResult, artifactPath: outputPath };
            if (isVerbose) {
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `Saved transcript → ${outputPath}`,
              ]);
            }
          } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : String(saveError);
            if (isVerbose) {
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `[ERROR] Failed to save transcript: ${message}`,
              ]);
            } else {
              enqueueStatus(`Failed to save transcript: ${message}`);
            }
          }

          if (isVerbose && isS3Url(filePath)) {
            try {
              const presignedUrl = await generatePresignedUrl(filePath);
              updatedResult = { ...updatedResult, presignedUrl };
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `[S3] Presigned URL (1h): ${presignedUrl}`,
              ]);
            } catch (s3Error) {
              const message = s3Error instanceof Error ? s3Error.message : String(s3Error);
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `[S3] Failed to generate presigned URL: ${message}`,
              ]);
            }
          }

          processResult = updatedResult;
        }
      } else if (selectedOption === 'generateTutorial') {
        processResult = await generateTutorial(filePath, {
          onStatus: enqueueStatus,
          onProgressChunk: enqueueTranscriptChunk,
          signal,
        });

        if (processResult.success && processResult.data) {
          const base = isS3Url(filePath) ? 'tutorial' : basename(filePath, extname(filePath));
          const outputPath = resolvePath(process.cwd(), `${base}.tutorial.md`);
          let updatedResult: ProcessingResult = { ...processResult };

          try {
            writeFileSync(outputPath, processResult.data, 'utf8');
            updatedResult = { ...updatedResult, artifactPath: outputPath };
            if (isVerbose) {
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `Saved tutorial → ${outputPath}`,
              ]);
            }
          } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : String(saveError);
            if (isVerbose) {
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `[ERROR] Failed to save tutorial: ${message}`,
              ]);
            } else {
              enqueueStatus(`Failed to save tutorial: ${message}`);
            }
          }

          if (isVerbose && isS3Url(filePath)) {
            try {
              const presignedUrl = await generatePresignedUrl(filePath);
              updatedResult = { ...updatedResult, presignedUrl };
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `[S3] Presigned URL (1h): ${presignedUrl}`,
              ]);
            } catch (s3Error) {
              const message = s3Error instanceof Error ? s3Error.message : String(s3Error);
              setConsoleMessages(prev => [
                ...prev.slice(-(MAX_CONSOLE_LINES - 1)),
                `[S3] Failed to generate presigned URL: ${message}`,
              ]);
            }
          }

          processResult = updatedResult;
        }
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
      // Ensure final flush and timer cleanup before toggling processing state
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushTranscript();

      if (statusFlushTimer) {
        clearTimeout(statusFlushTimer);
        statusFlushTimer = null;
      }
      flushStatus();

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
  };

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

  if (screen === 'menu') {
    return (
      <Box borderStyle="round" borderColor="cyan" flexDirection="column">
        <Menu onSelect={handleMenuSelect} />
      </Box>
    );
  }

  if (screen === 'fileInput' && selectedOption) {
    return (
      <Box borderStyle="round" borderColor="cyan" flexDirection="column">
        <FileInput operationType={selectedOption} onSubmit={handleFileSubmit} onCancel={resetWizard} />
      </Box>
    );
  }

  if (screen === 'processing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">
            {spinnerSymbol} Processing...
          </Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          {statusMessages.length === 0 ? (
            <Text dimColor>Please wait while we process your file...</Text>
          ) : (
            statusMessages.map((message, index) => (
              <Text key={`${message}-${index}`} dimColor>
                {message}
              </Text>
            ))
          )}
        </Box>
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} paddingY={0}>
          <Text dimColor>Live output (last 3 lines):</Text>
          {transcriptState.lines.length > 0 ? (
            transcriptState.lines.map((line, index) => (
              <Text key={`line-${index}`}>{line}</Text>
            ))
          ) : (
            <Text dimColor>Waiting for output...</Text>
          )}
        </Box>
        {isVerbose && consoleMessages.length > 0 && (
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            paddingY={0}
            marginTop={1}
          >
            <Text dimColor>Console tail:</Text>
            {consoleMessages.map((line, index) => (
              <Text key={`processing-console-${index}`} dimColor>
                {line}
              </Text>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Press Q or Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'complete' && result) {
    const accentColor = result.success ? 'green' : 'red';
    const title = result.success ? '✓ Complete!' : '⚠ Processing finished with issues';

    return (
      <Box borderStyle="round" borderColor={accentColor} flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={accentColor}>
            {title}
          </Text>
        </Box>
        <Text>{result.message}</Text>
        {result.artifactPath && (
          <Box marginTop={1}>
            <Text dimColor>Saved output → {result.artifactPath}</Text>
          </Box>
        )}
        {isVerbose && result.presignedUrl && (
          <Box marginTop={1}>
            <Text dimColor>S3 presigned URL (1h): {result.presignedUrl}</Text>
          </Box>
        )}
        {result.error && (
          <Box marginTop={1}>
            <Text dimColor>{result.error}</Text>
          </Box>
        )}
        {previewLines && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Output preview (first 3 lines):</Text>
            {previewLines.map((line, index) => (
              <Text key={`preview-${index}`}>{line}</Text>
            ))}
          </Box>
        )}
        {consoleMessages.length > 0 && (
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="cyan"
            paddingX={1}
            paddingY={0}
            marginTop={1}
          >
            <Text dimColor>Console output (last {consoleMessages.length}):</Text>
            {consoleMessages.map((line, index) => (
              <Text key={`complete-console-${index}`} color="cyan">
                {line}
              </Text>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>
            Press Enter or M to return to menu
            {result.data ? ' • Press O to preview output' : ''}
            • Press Q to exit
          </Text>
        </Box>
      </Box>
    );
  }

  return null;
};
