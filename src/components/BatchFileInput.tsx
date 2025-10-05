import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { glob } from 'glob';

interface BatchFileInputProps {
  onSubmit: (filePaths: string[]) => void;
  onCancel?: () => void;
}

export const BatchFileInput: React.FC<BatchFileInputProps> = ({ onSubmit, onCancel }) => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useInput((inputChar, key) => {
    if (key.escape && onCancel) {
      onCancel();
    }
  });

  const handleAddPath = async () => {
    if (!input.trim()) {
      return;
    }

    setErrorMessage('');
    const trimmedInput = input.trim().replace(/^["']|["']$/g, '');

    // Check if input contains glob pattern
    const hasGlobPattern = trimmedInput.includes('*') || trimmedInput.includes('?');

    if (hasGlobPattern) {
      try {
        const matches = await glob(trimmedInput, { nodir: true });
        if (matches.length === 0) {
          setErrorMessage(`No files matched pattern: ${trimmedInput}`);
          return;
        }

        const newFiles = matches.filter(f => !files.includes(f));
        if (newFiles.length === 0) {
          setErrorMessage('All matched files are already in the list');
          return;
        }

        setFiles(prev => [...prev, ...newFiles]);
        setInput('');
      } catch (error) {
        setErrorMessage(`Error expanding glob pattern: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Single file
      if (files.includes(trimmedInput)) {
        setErrorMessage('File already added');
        return;
      }

      setFiles(prev => [...prev, trimmedInput]);
      setInput('');
    }
  };

  const handleRemoveFile = () => {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < files.length) {
      setFiles(prev => prev.filter((_, idx) => idx !== selectedIndex));
      setSelectedIndex(null);
    }
  };

  const handleSubmit = () => {
    if (files.length === 0) {
      setErrorMessage('Please add at least one file');
      return;
    }
    onSubmit(files);
  };

  useInput((inputChar, key) => {
    if (selectedIndex === null) {
      return;
    }

    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }

    if (key.downArrow && selectedIndex < files.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }

    if (key.delete || key.backspace || inputChar === 'd') {
      handleRemoveFile();
    }
  }, { isActive: selectedIndex !== null });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📦 Batch Transcription - Select Files
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Add files or glob patterns (e.g., /path/to/*.mp4):</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleAddPath}
          placeholder="/path/to/file.mp4 or /path/to/*.mp4"
        />
      </Box>

      {errorMessage && (
        <Box marginBottom={1}>
          <Text color="red">⚠ {errorMessage}</Text>
        </Box>
      )}

      {files.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold>Files ({files.length}):</Text>
          </Box>

          <Box flexDirection="column" marginBottom={1} marginLeft={1}>
            {files.slice(0, 8).map((file, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <Box key={idx}>
                  <Text color={isSelected ? 'cyan' : 'white'}>
                    {isSelected ? '❯ ' : '  '}
                    {idx + 1}. {file}
                  </Text>
                </Box>
              );
            })}
            {files.length > 8 && (
              <Box marginTop={1}>
                <Text dimColor>... and {files.length - 8} more files</Text>
              </Box>
            )}
          </Box>
        </>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text dimColor>
            {selectedIndex === null ? (
              <>Enter to add • Tab to select files • Ctrl+N to continue{files.length > 0 ? ' • Esc to cancel' : ''}</>
            ) : (
              <>↑↓ Navigate • D/Del to remove • Tab to deselect • Ctrl+N to continue</>
            )}
          </Text>
        </Box>

        <Box>
          <Text dimColor>
            💡 Tip: Use glob patterns like "*.mp4" or "videos/*.{mp4,mkv}"
          </Text>
        </Box>
      </Box>

      {/* Handle special keys */}
      <TabHandler
        onTab={() => {
          if (selectedIndex === null && files.length > 0) {
            setSelectedIndex(0);
          } else {
            setSelectedIndex(null);
          }
        }}
        onCtrlN={handleSubmit}
        isActive={true}
      />
    </Box>
  );
};

// Helper component for handling Tab and Ctrl+N
const TabHandler: React.FC<{ onTab: () => void; onCtrlN: () => void; isActive: boolean }> = ({
  onTab,
  onCtrlN,
  isActive,
}) => {
  useInput((input, key) => {
    if (key.tab) {
      onTab();
    }
    if (key.ctrl && input === 'n') {
      onCtrlN();
    }
  }, { isActive });

  return null;
};
