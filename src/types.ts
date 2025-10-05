export type WizardScreen = 'menu' | 'fileInput' | 'processing' | 'complete' | 'batchFileInput' | 'batchConfig' | 'batchProcessing' | 'batchComplete';

export type OperationType = 'transcribe' | 'generateTutorial' | 'batchTranscribe';

export interface MenuOption {
  id: OperationType;
  label: string;
  emoji: string;
}

export type ProcessingStage =
  | 'initializing'
  | 'downloading'
  | 'uploading'
  | 'processing'
  | 'generating'
  | 'finalizing'
  | 'complete';

export interface StageInfo {
  stage: ProcessingStage;
  label: string;
  description: string;
  icon: string;
  estimatedDurationMs?: number;
}

export interface ProcessingProgress {
  currentStage: ProcessingStage;
  completedStages: ProcessingStage[];
  startTime: number;
  stageStartTime: number;
  estimatedTimeRemaining?: number;
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  error?: string;
  data?: string;
  artifactPath?: string;
  presignedUrl?: string;
  outputFormat?: string;
}

// Batch Processing Types
export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BatchFile {
  id: string;
  filePath: string;
  status: BatchStatus;
  progress: number; // 0-100
  startTime?: number;
  endTime?: number;
  error?: string;
  result?: ProcessingResult;
  abortController?: AbortController;
}

export interface BatchQueueState {
  files: BatchFile[];
  currentlyProcessing: string[]; // Array of file IDs
  completed: string[];
  failed: string[];
  cancelled: string[];
}

export type FileNamingPattern = 'original' | 'timestamp' | 'sequential';

export interface BatchConfiguration {
  concurrencyLimit: number; // 1-5
  continueOnError: boolean;
  namingPattern: FileNamingPattern;
  operationType: OperationType;
}
