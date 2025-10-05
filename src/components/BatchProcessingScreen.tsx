import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { BatchFile, BatchQueueState } from '../types.js';

interface BatchProcessingScreenProps {
  queueState: BatchQueueState;
  overallProgress: number;
  isPaused: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

export const BatchProcessingScreen: React.FC<BatchProcessingScreenProps> = ({
  queueState,
  overallProgress,
  isPaused,
  onPause,
  onResume,
  onCancel,
}) => {
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onCancel?.();
    }
    if (input === 'p' && !isPaused) {
      onPause?.();
    }
    if (input === 'r' && isPaused) {
      onResume?.();
    }
  });

  const totalFiles = queueState.files.length;
  const completedCount = queueState.completed.length;
  const failedCount = queueState.failed.length;
  const processingCount = queueState.currentlyProcessing.length;
  const pendingCount = queueState.files.filter(f => f.status === 'pending').length;

  const renderProgressBar = (progress: number, width: number = 30): string => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path;
  };

  const formatElapsedTime = (startTime: number): string => {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const currentlyProcessingFiles = queueState.files.filter(f =>
    queueState.currentlyProcessing.includes(f.id)
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {isPaused ? '⏸ Batch Processing (Paused)' : '⚡ Batch Processing'}
        </Text>
      </Box>

      {/* Overall Progress */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text>
            Overall Progress: <Text bold color="yellow">{Math.round(overallProgress)}%</Text>
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="cyan">{renderProgressBar(overallProgress, 40)}</Text>
        </Box>
        <Box>
          <Text dimColor>
            {completedCount}/{totalFiles} completed • {failedCount} failed • {processingCount} processing • {pendingCount} pending
          </Text>
        </Box>
      </Box>

      {/* Currently Processing Files */}
      {currentlyProcessingFiles.length > 0 && (
        <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text bold color="yellow">Currently Processing ({processingCount}):</Text>
          {currentlyProcessingFiles.map(file => (
            <Box key={file.id} flexDirection="column" marginTop={1}>
              <Box>
                <Text>
                  📄 <Text bold>{getFileName(file.filePath)}</Text>
                </Text>
              </Box>
              <Box marginLeft={2}>
                <Text color="cyan">{renderProgressBar(file.progress, 30)}</Text>
                <Text> {Math.round(file.progress)}%</Text>
              </Box>
              {file.startTime && (
                <Box marginLeft={2}>
                  <Text dimColor>Elapsed: {formatElapsedTime(file.startTime)}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Completed Files Summary */}
      {completedCount > 0 && (
        <Box marginBottom={1}>
          <Text color="green">
            ✓ Completed: {completedCount} file{completedCount !== 1 ? 's' : ''}
          </Text>
        </Box>
      )}

      {/* Failed Files Summary */}
      {failedCount > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red">✗ Failed: {failedCount} file{failedCount !== 1 ? 's' : ''}</Text>
          {queueState.files
            .filter(f => f.status === 'failed')
            .slice(0, 3)
            .map(file => (
              <Box key={file.id} marginLeft={2}>
                <Text color="red">
                  • {getFileName(file.filePath)}: {file.error || 'Unknown error'}
                </Text>
              </Box>
            ))}
          {failedCount > 3 && (
            <Box marginLeft={2}>
              <Text dimColor>... and {failedCount - 3} more</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Pending Files Preview */}
      {pendingCount > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>
            ⏳ Pending: {pendingCount} file{pendingCount !== 1 ? 's' : ''}
          </Text>
        </Box>
      )}

      {/* Controls */}
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Box>
          <Text bold>Controls:</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            {isPaused ? (
              <>R to resume • Q/Esc to cancel</>
            ) : (
              <>P to pause • Q/Esc to cancel</>
            )}
          </Text>
        </Box>
        {isPaused && (
          <Box marginTop={1}>
            <Text color="yellow">⚠ Processing paused. Press R to resume.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
