export type WizardScreen = 'menu' | 'fileInput' | 'processing' | 'complete';

export type OperationType = 'transcribe' | 'generateTutorial';

export interface MenuOption {
  id: OperationType;
  label: string;
  emoji: string;
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  error?: string;
  data?: string;
  artifactPath?: string;
  presignedUrl?: string;
}
