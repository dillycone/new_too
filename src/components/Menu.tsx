import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MenuOption, OperationType } from '../types.js';

interface MenuProps {
  onSelect: (option: OperationType) => void;
}

const menuOptions: MenuOption[] = [
  {
    id: 'transcribe',
    label: 'Transcribe audio/video file',
    emoji: '🎬',
  },
  {
    id: 'generateTutorial',
    label: 'Generate tutorial from audio/video file',
    emoji: '📚',
  },
];

export const Menu: React.FC<MenuProps> = ({ onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : menuOptions.length - 1));
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev < menuOptions.length - 1 ? prev + 1 : 0));
    }

    if (key.return) {
      const option = menuOptions[selectedIndex];
      if (option) {
        onSelect(option.id);
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🎬 Media Processing Wizard
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Select an option:</Text>
      </Box>

      {menuOptions.map((option, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={option.id} marginLeft={1}>
            <Text color={isSelected ? 'cyan' : 'gray'}>
              {isSelected ? '❯ ' : '  '}
              {option.label}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>↑↓ Navigate • Enter to select • Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};
