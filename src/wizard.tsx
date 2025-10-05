import React from 'react';
import { Box } from 'ink';
import { Menu } from './components/Menu.js';
import { FileInput } from './components/FileInput.js';
import { ProcessingScreen } from './components/ProcessingScreen.js';
import { CompleteScreen } from './components/CompleteScreen.js';
import { useWizardController } from './hooks/useWizardController.js';

export const Wizard: React.FC = () => {
  const {
    screen,
    selectedOption,
    spinnerSymbol,
    statusMessages,
    consoleMessages,
    transcriptLines,
    previewLines,
    result,
    showProcessingConsoleTail,
    isVerbose,
    handleMenuSelect,
    handleFileSubmit,
    resetWizard,
  } = useWizardController();

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
      <ProcessingScreen
        spinnerSymbol={spinnerSymbol}
        statusMessages={statusMessages}
        transcriptLines={transcriptLines}
        consoleMessages={consoleMessages}
        showConsoleTail={showProcessingConsoleTail}
      />
    );
  }

  if (screen === 'complete' && result) {
    return (
      <CompleteScreen
        result={result}
        previewLines={previewLines}
        consoleMessages={consoleMessages}
        isVerbose={isVerbose}
      />
    );
  }

  return null;
};
