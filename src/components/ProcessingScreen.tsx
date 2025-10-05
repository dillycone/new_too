import React from 'react';
import { Box, Text } from 'ink';

interface ProcessingScreenProps {
  spinnerSymbol: string;
  statusMessages: string[];
  transcriptLines: string[];
  consoleMessages: string[];
  showConsoleTail: boolean;
}

export const ProcessingScreen: React.FC<ProcessingScreenProps> = ({
  spinnerSymbol,
  statusMessages,
  transcriptLines,
  consoleMessages,
  showConsoleTail,
}) => {
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
        {transcriptLines.length > 0 ? (
          transcriptLines.map((line, index) => (
            <Text key={`line-${index}`}>{line}</Text>
          ))
        ) : (
          <Text dimColor>Waiting for output...</Text>
        )}
      </Box>
      {showConsoleTail && (
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
};
