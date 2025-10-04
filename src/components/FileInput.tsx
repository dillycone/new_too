import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { OperationType } from '../types.js';

interface FileInputProps {
  operationType: OperationType;
  onSubmit: (filePath: string) => void;
  onCancel?: () => void;
}

const getTitle = (type: OperationType): string => {
  switch (type) {
    case 'transcribe':
      return '🎬 Transcribe Audio/Video File';
    case 'generateTutorial':
      return '📚 Generate Tutorial from Audio/Video File';
    default:
      return 'Media Processing';
  }
};

export const FileInput: React.FC<FileInputProps> = ({ operationType, onSubmit, onCancel }) => {
  const [filePath, setFilePath] = useState('');

  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
    }
  });

  const handleSubmit = () => {
    if (filePath.trim()) {
      // Remove quotes if user drags and drops a file (some terminals add quotes)
      const cleanPath = filePath.trim().replace(/^["']|["']$/g, '');
      onSubmit(cleanPath);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {getTitle(operationType)}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Enter the path to your audio or video file:</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={filePath}
          onChange={setFilePath}
          onSubmit={handleSubmit}
          placeholder="/path/to/your/file.mp4"
        />
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>💡 Tip: Drag and drop a file here to populate the path</Text>
      </Box>

      <Box>
        <Text dimColor>Enter to continue • Esc to go back • Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};
