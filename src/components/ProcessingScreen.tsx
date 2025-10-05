import React from 'react';
import { Box, Text } from 'ink';
import type { ProcessingStage } from '../types.js';
import {
  STAGE_ORDER,
  getStageInfo,
  getStageIndex,
  formatDuration,
} from '../config/processingStages.js';

interface ProcessingScreenProps {
  spinnerSymbol: string;
  statusMessages: string[];
  transcriptLines: string[];
  consoleMessages: string[];
  showConsoleTail: boolean;
  currentStage?: ProcessingStage;
  completedStages?: ProcessingStage[];
  elapsedTime?: number;
  estimatedRemaining?: number;
}

export const ProcessingScreen: React.FC<ProcessingScreenProps> = ({
  spinnerSymbol,
  statusMessages,
  transcriptLines,
  consoleMessages,
  showConsoleTail,
  currentStage,
  completedStages = [],
  elapsedTime,
  estimatedRemaining,
}) => {
  const currentStageInfo = currentStage ? getStageInfo(currentStage) : null;
  const currentStageIndex = currentStage ? getStageIndex(currentStage) : -1;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          {spinnerSymbol} Processing...
        </Text>
      </Box>

      {/* Stage Progress Bar */}
      {currentStage && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={0}>
            <Text bold>Progress:</Text>
          </Box>
          <Box>
            {STAGE_ORDER.map((stage, index) => {
              const stageInfo = getStageInfo(stage);
              const isCompleted = completedStages.includes(stage);
              const isCurrent = stage === currentStage;
              const isPending = index > currentStageIndex;

              let symbol = '';
              let color: 'green' | 'yellow' | 'gray' = 'gray';

              if (isCompleted) {
                symbol = stageInfo.icon;
                color = 'green';
              } else if (isCurrent) {
                symbol = stageInfo.icon;
                color = 'yellow';
              } else if (isPending) {
                symbol = '○';
                color = 'gray';
              }

              return (
                <Text key={stage} color={color}>
                  {symbol}
                  {index < STAGE_ORDER.length - 1 ? ' → ' : ''}
                </Text>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Current Stage Info */}
      {currentStageInfo && (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          <Box>
            <Text bold color="cyan">
              {currentStageInfo.label}:
            </Text>
            <Text> {currentStageInfo.description}</Text>
          </Box>
        </Box>
      )}

      {/* Time Tracking */}
      {(elapsedTime !== undefined || estimatedRemaining !== undefined) && (
        <Box flexDirection="column" marginBottom={1} paddingX={1}>
          {elapsedTime !== undefined && (
            <Box>
              <Text dimColor>Elapsed: </Text>
              <Text>{formatDuration(elapsedTime)}</Text>
            </Box>
          )}
          {estimatedRemaining !== undefined && (
            <Box>
              <Text dimColor>Est. remaining: </Text>
              <Text>{formatDuration(estimatedRemaining)}</Text>
            </Box>
          )}
          {estimatedRemaining === undefined && currentStage === 'generating' && (
            <Box>
              <Text dimColor>Est. remaining: </Text>
              <Text italic>Depends on content length...</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Status Messages */}
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

      {/* Live Output */}
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

      {/* Console Tail (verbose mode) */}
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
