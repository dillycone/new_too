import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { BatchFile } from '../types.js';

interface BatchCompleteScreenProps {
  files: BatchFile[];
  onReturnToMenu: () => void;
  onExit: () => void;
}

export const BatchCompleteScreen: React.FC<BatchCompleteScreenProps> = ({
  files,
  onReturnToMenu,
  onExit,
}) => {
  const [showSuccessful, setShowSuccessful] = useState(true);

  const successfulFiles = files.filter(f => f.status === 'completed' && f.result?.success);
  const failedFiles = files.filter(f => f.status === 'failed' || (f.result && !f.result.success));
  const cancelledFiles = files.filter(f => f.status === 'cancelled');

  const totalFiles = files.length;
  const successCount = successfulFiles.length;
  const failedCount = failedFiles.length;
  const cancelledCount = cancelledFiles.length;

  const successRate = totalFiles > 0 ? Math.round((successCount / totalFiles) * 100) : 0;

  useInput((input, key) => {
    const normalizedInput = input?.toLowerCase();

    if (key.return || normalizedInput === 'm') {
      onReturnToMenu();
    }

    if (normalizedInput === 'q') {
      onExit();
    }

    if (normalizedInput === 's') {
      setShowSuccessful(true);
    }

    if (normalizedInput === 'f') {
      setShowSuccessful(false);
    }
  });

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path;
  };

  const formatDuration = (startTime?: number, endTime?: number): string => {
    if (!startTime || !endTime) return 'N/A';
    const duration = endTime - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {successCount === totalFiles ? '✅' : failedCount > 0 ? '⚠' : '🏁'} Batch Processing Complete
        </Text>
      </Box>

      {/* Summary Statistics */}
      <Box
        flexDirection="column"
        marginBottom={1}
        borderStyle="round"
        borderColor={successCount === totalFiles ? 'green' : failedCount > 0 ? 'yellow' : 'cyan'}
        padding={1}
      >
        <Text bold>Summary:</Text>
        <Box marginTop={1}>
          <Text>
            Total files: <Text bold color="cyan">{totalFiles}</Text>
          </Text>
        </Box>
        <Box>
          <Text>
            Successful: <Text bold color="green">{successCount}</Text>
          </Text>
        </Box>
        {failedCount > 0 && (
          <Box>
            <Text>
              Failed: <Text bold color="red">{failedCount}</Text>
            </Text>
          </Box>
        )}
        {cancelledCount > 0 && (
          <Box>
            <Text>
              Cancelled: <Text bold color="yellow">{cancelledCount}</Text>
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text>
            Success rate: <Text bold color={successRate === 100 ? 'green' : successRate >= 80 ? 'yellow' : 'red'}>
              {successRate}%
            </Text>
          </Text>
        </Box>
      </Box>

      {/* Tab Navigation */}
      {(successCount > 0 || failedCount > 0) && (
        <Box marginBottom={1}>
          <Text>
            View:{' '}
            <Text color={showSuccessful ? 'cyan' : 'white'} bold={showSuccessful}>
              [S]uccessful ({successCount})
            </Text>
            {' | '}
            <Text color={!showSuccessful ? 'cyan' : 'white'} bold={!showSuccessful}>
              [F]ailed ({failedCount})
            </Text>
          </Text>
        </Box>
      )}

      {/* Successful Files List */}
      {showSuccessful && successCount > 0 && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="green" padding={1}>
          <Text bold color="green">✓ Successful Files:</Text>
          {successfulFiles.slice(0, 10).map((file, idx) => (
            <Box key={file.id} flexDirection="column" marginTop={1}>
              <Box>
                <Text>
                  {idx + 1}. <Text bold>{getFileName(file.filePath)}</Text>
                </Text>
              </Box>
              {file.result?.artifactPath && (
                <Box marginLeft={3}>
                  <Text dimColor>→ {file.result.artifactPath}</Text>
                </Box>
              )}
              <Box marginLeft={3}>
                <Text dimColor>Duration: {formatDuration(file.startTime, file.endTime)}</Text>
              </Box>
            </Box>
          ))}
          {successCount > 10 && (
            <Box marginTop={1}>
              <Text dimColor>... and {successCount - 10} more successful files</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Failed Files List */}
      {!showSuccessful && failedCount > 0 && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="red" padding={1}>
          <Text bold color="red">✗ Failed Files:</Text>
          {failedFiles.slice(0, 10).map((file, idx) => (
            <Box key={file.id} flexDirection="column" marginTop={1}>
              <Box>
                <Text>
                  {idx + 1}. <Text bold>{getFileName(file.filePath)}</Text>
                </Text>
              </Box>
              <Box marginLeft={3}>
                <Text color="red">Error: {file.error || file.result?.error || 'Unknown error'}</Text>
              </Box>
              {file.startTime && (
                <Box marginLeft={3}>
                  <Text dimColor>Duration: {formatDuration(file.startTime, file.endTime)}</Text>
                </Box>
              )}
            </Box>
          ))}
          {failedCount > 10 && (
            <Box marginTop={1}>
              <Text dimColor>... and {failedCount - 10} more failed files</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Cancelled Files */}
      {cancelledCount > 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">
            ⚠ {cancelledCount} file{cancelledCount !== 1 ? 's were' : ' was'} cancelled
          </Text>
        </Box>
      )}

      {/* Controls */}
      <Box flexDirection="column" marginTop={1}>
        {(successCount > 0 || failedCount > 0) && (
          <Box marginBottom={1}>
            <Text dimColor>S to view successful • F to view failed</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>M or Enter to return to menu • Q to exit</Text>
        </Box>
      </Box>
    </Box>
  );
};
