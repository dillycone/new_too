import React from 'react';
import { Box, Text } from 'ink';
import type { ProcessingResult } from '../types.js';

interface CompleteScreenProps {
  result: ProcessingResult;
  previewLines: string[] | null;
  consoleMessages: string[];
  isVerbose: boolean;
}

export const CompleteScreen: React.FC<CompleteScreenProps> = ({
  result,
  previewLines,
  consoleMessages,
  isVerbose,
}) => {
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
};
