import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { BatchConfiguration, FileNamingPattern } from '../types.js';

interface BatchConfigScreenProps {
  fileCount: number;
  onStart: (config: BatchConfiguration) => void;
  onCancel?: () => void;
}

type SettingField = 'concurrency' | 'continueOnError' | 'namingPattern';

export const BatchConfigScreen: React.FC<BatchConfigScreenProps> = ({ fileCount, onStart, onCancel }) => {
  const [concurrencyLimit, setConcurrencyLimit] = useState(2);
  const [continueOnError, setContinueOnError] = useState(true);
  const [namingPattern, setNamingPattern] = useState<FileNamingPattern>('original');
  const [selectedField, setSelectedField] = useState<SettingField>('concurrency');

  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
      return;
    }

    // Navigate between fields
    if (key.upArrow) {
      setSelectedField(prev => {
        if (prev === 'concurrency') return 'namingPattern';
        if (prev === 'continueOnError') return 'concurrency';
        return 'continueOnError';
      });
      return;
    }

    if (key.downArrow) {
      setSelectedField(prev => {
        if (prev === 'concurrency') return 'continueOnError';
        if (prev === 'continueOnError') return 'namingPattern';
        return 'concurrency';
      });
      return;
    }

    // Adjust values based on selected field
    if (selectedField === 'concurrency') {
      if (key.leftArrow && concurrencyLimit > 1) {
        setConcurrencyLimit(prev => prev - 1);
      }
      if (key.rightArrow && concurrencyLimit < 5) {
        setConcurrencyLimit(prev => prev + 1);
      }
    }

    if (selectedField === 'continueOnError') {
      if (key.leftArrow || key.rightArrow || input === ' ') {
        setContinueOnError(prev => !prev);
      }
    }

    if (selectedField === 'namingPattern') {
      if (key.leftArrow) {
        setNamingPattern(prev => {
          if (prev === 'original') return 'sequential';
          if (prev === 'timestamp') return 'original';
          return 'timestamp';
        });
      }
      if (key.rightArrow) {
        setNamingPattern(prev => {
          if (prev === 'original') return 'timestamp';
          if (prev === 'timestamp') return 'sequential';
          return 'original';
        });
      }
    }

    // Start processing
    if (key.return || (key.ctrl && input === 's')) {
      const config: BatchConfiguration = {
        concurrencyLimit,
        continueOnError,
        namingPattern,
        operationType: 'batchTranscribe',
      };
      onStart(config);
    }
  });

  const getNamingPatternDescription = (pattern: FileNamingPattern): string => {
    switch (pattern) {
      case 'original':
        return 'Use original filename (file.mp4 → file.transcript.txt)';
      case 'timestamp':
        return 'Add timestamp (file.mp4 → file.20250105_143022.transcript.txt)';
      case 'sequential':
        return 'Add sequence number (file.mp4 → file.001.transcript.txt)';
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          ⚙ Batch Configuration
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Configure batch processing for <Text bold color="yellow">{fileCount}</Text> file{fileCount !== 1 ? 's' : ''}:
        </Text>
      </Box>

      {/* Concurrency Setting */}
      <Box marginBottom={1} marginLeft={1}>
        <Text color={selectedField === 'concurrency' ? 'cyan' : 'white'}>
          {selectedField === 'concurrency' ? '❯ ' : '  '}
          Concurrent files: <Text bold color={selectedField === 'concurrency' ? 'cyan' : 'yellow'}>{concurrencyLimit}</Text>
          {selectedField === 'concurrency' && ' ◀ ▶'}
        </Text>
      </Box>

      {selectedField === 'concurrency' && (
        <Box marginBottom={1} marginLeft={3}>
          <Text dimColor>Process up to {concurrencyLimit} file{concurrencyLimit !== 1 ? 's' : ''} simultaneously</Text>
        </Box>
      )}

      {/* Continue on Error Setting */}
      <Box marginBottom={1} marginLeft={1}>
        <Text color={selectedField === 'continueOnError' ? 'cyan' : 'white'}>
          {selectedField === 'continueOnError' ? '❯ ' : '  '}
          Continue on error: <Text bold color={continueOnError ? 'green' : 'red'}>
            {continueOnError ? 'Yes' : 'No'}
          </Text>
          {selectedField === 'continueOnError' && ' ◀ ▶'}
        </Text>
      </Box>

      {selectedField === 'continueOnError' && (
        <Box marginBottom={1} marginLeft={3}>
          <Text dimColor>
            {continueOnError
              ? 'Continue processing remaining files if one fails'
              : 'Stop all processing if any file fails'}
          </Text>
        </Box>
      )}

      {/* Naming Pattern Setting */}
      <Box marginBottom={1} marginLeft={1}>
        <Text color={selectedField === 'namingPattern' ? 'cyan' : 'white'}>
          {selectedField === 'namingPattern' ? '❯ ' : '  '}
          Output naming: <Text bold color={selectedField === 'namingPattern' ? 'cyan' : 'yellow'}>
            {namingPattern}
          </Text>
          {selectedField === 'namingPattern' && ' ◀ ▶'}
        </Text>
      </Box>

      {selectedField === 'namingPattern' && (
        <Box marginBottom={1} marginLeft={3}>
          <Text dimColor>{getNamingPatternDescription(namingPattern)}</Text>
        </Box>
      )}

      {/* Summary */}
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" padding={1}>
        <Text bold>Summary:</Text>
        <Text>• Processing {fileCount} file{fileCount !== 1 ? 's' : ''}</Text>
        <Text>• Up to {concurrencyLimit} concurrent operation{concurrencyLimit !== 1 ? 's' : ''}</Text>
        <Text>• {continueOnError ? 'Will continue' : 'Will stop'} on errors</Text>
        <Text>• Output naming: {namingPattern}</Text>
      </Box>

      {/* Controls */}
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text dimColor>↑↓ Navigate settings • ◀ ▶ Change values</Text>
        </Box>
        <Box>
          <Text dimColor>Enter or Ctrl+S to start • Esc to cancel</Text>
        </Box>
      </Box>
    </Box>
  );
};
