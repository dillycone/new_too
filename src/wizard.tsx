import React from 'react';
import { Box } from 'ink';
import { Menu } from './components/Menu.js';
import { FileInput } from './components/FileInput.js';
import { ProcessingScreen } from './components/ProcessingScreen.js';
import { CompleteScreen } from './components/CompleteScreen.js';
import { BatchFileInput } from './components/BatchFileInput.js';
import { BatchConfigScreen } from './components/BatchConfigScreen.js';
import { BatchProcessingScreen } from './components/BatchProcessingScreen.js';
import { BatchCompleteScreen } from './components/BatchCompleteScreen.js';
import { useWizardController } from './hooks/useWizardController.js';
import { useApp } from 'ink';

export const Wizard: React.FC = () => {
  const { exit } = useApp();
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
    currentStage,
    completedStages,
    elapsedTime,
    estimatedRemaining,
    handleMenuSelect,
    handleFileSubmit,
    resetWizard,
    // Batch processing state
    batchFiles,
    batchConfig,
    batchQueueState,
    batchOverallProgress,
    batchIsPaused,
    handleBatchFilesSubmit,
    handleBatchConfigSubmit,
    handleBatchPause,
    handleBatchResume,
    handleBatchCancel,
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
        {...(currentStage ? { currentStage } : {})}
        completedStages={completedStages}
        elapsedTime={elapsedTime}
        {...(estimatedRemaining !== undefined ? { estimatedRemaining } : {})}
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

  // Batch processing screens
  if (screen === 'batchFileInput') {
    return (
      <Box borderStyle="round" borderColor="cyan" flexDirection="column">
        <BatchFileInput onSubmit={handleBatchFilesSubmit} onCancel={resetWizard} />
      </Box>
    );
  }

  if (screen === 'batchConfig') {
    return (
      <Box borderStyle="round" borderColor="cyan" flexDirection="column">
        <BatchConfigScreen
          fileCount={batchFiles.length}
          onStart={handleBatchConfigSubmit}
          onCancel={resetWizard}
        />
      </Box>
    );
  }

  if (screen === 'batchProcessing') {
    return (
      <Box borderStyle="round" borderColor="yellow" flexDirection="column">
        <BatchProcessingScreen
          queueState={batchQueueState}
          overallProgress={batchOverallProgress}
          isPaused={batchIsPaused}
          onPause={handleBatchPause}
          onResume={handleBatchResume}
          onCancel={handleBatchCancel}
        />
      </Box>
    );
  }

  if (screen === 'batchComplete') {
    return (
      <Box borderStyle="round" borderColor="green" flexDirection="column">
        <BatchCompleteScreen
          files={batchQueueState.files}
          onReturnToMenu={resetWizard}
          onExit={exit}
        />
      </Box>
    );
  }

  return null;
};
