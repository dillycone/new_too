import type { ProcessingStage, StageInfo } from '../types.js';

/**
 * Comprehensive definitions for all processing stages.
 * Each stage includes metadata for UI display and time estimation.
 */
export const STAGE_DEFINITIONS: Record<ProcessingStage, StageInfo> = {
  initializing: {
    stage: 'initializing',
    label: 'Initializing',
    description: 'Setting up processing environment',
    icon: '⚙️',
    estimatedDurationMs: 500,
  },
  downloading: {
    stage: 'downloading',
    label: 'Downloading',
    description: 'Downloading file from S3',
    icon: '⬇️',
    estimatedDurationMs: 3000,
  },
  uploading: {
    stage: 'uploading',
    label: 'Uploading',
    description: 'Uploading to Gemini Files API',
    icon: '⬆️',
    estimatedDurationMs: 5000,
  },
  processing: {
    stage: 'processing',
    label: 'Processing',
    description: 'Processing file with Gemini AI',
    icon: '🔄',
    estimatedDurationMs: 10000,
  },
  generating: {
    stage: 'generating',
    label: 'Generating',
    description: 'Generating output content',
    icon: '✨',
    // No estimate - depends on content length and model speed
  },
  finalizing: {
    stage: 'finalizing',
    label: 'Finalizing',
    description: 'Saving results and cleaning up',
    icon: '📝',
    estimatedDurationMs: 2000,
  },
  complete: {
    stage: 'complete',
    label: 'Complete',
    description: 'Processing finished successfully',
    icon: '✓',
    estimatedDurationMs: 0,
  },
};

/**
 * Get the ordered list of stages for progression tracking.
 */
export const STAGE_ORDER: ProcessingStage[] = [
  'initializing',
  'downloading',
  'uploading',
  'processing',
  'generating',
  'finalizing',
  'complete',
];

/**
 * Get stage information by stage type.
 */
export function getStageInfo(stage: ProcessingStage): StageInfo {
  return STAGE_DEFINITIONS[stage];
}

/**
 * Calculate the index/position of a stage in the progression.
 */
export function getStageIndex(stage: ProcessingStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Check if a stage has been completed based on current stage.
 */
export function isStageCompleted(stage: ProcessingStage, currentStage: ProcessingStage): boolean {
  return getStageIndex(stage) < getStageIndex(currentStage);
}

/**
 * Get estimated total duration for all stages with known durations.
 */
export function getEstimatedTotalDuration(): number {
  return STAGE_ORDER.reduce((total, stage) => {
    const duration = STAGE_DEFINITIONS[stage].estimatedDurationMs;
    return total + (duration || 0);
  }, 0);
}

/**
 * Calculate estimated remaining time based on current stage and elapsed time.
 * Returns undefined if estimation is not possible (e.g., in 'generating' stage).
 */
export function calculateEstimatedRemaining(
  currentStage: ProcessingStage,
  completedStages: ProcessingStage[],
  stageStartTime: number
): number | undefined {
  const currentStageInfo = STAGE_DEFINITIONS[currentStage];

  // If current stage has no duration estimate, we can't calculate remaining time
  if (!currentStageInfo.estimatedDurationMs) {
    return undefined;
  }

  const currentIndex = getStageIndex(currentStage);
  const remainingStages = STAGE_ORDER.slice(currentIndex + 1);

  // Calculate remaining time for future stages
  const futureStagesTime = remainingStages.reduce((total, stage) => {
    const duration = STAGE_DEFINITIONS[stage].estimatedDurationMs;
    return total + (duration || 0);
  }, 0);

  // Calculate remaining time for current stage
  const elapsedInCurrentStage = Date.now() - stageStartTime;
  const currentStageRemaining = Math.max(
    0,
    currentStageInfo.estimatedDurationMs - elapsedInCurrentStage
  );

  return currentStageRemaining + futureStagesTime;
}

/**
 * Format milliseconds to a human-readable duration string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}
