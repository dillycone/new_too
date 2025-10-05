/**
 * Global cleanup handler for managing temporary files created during streaming operations.
 * Ensures proper cleanup on process exit (normal, SIGINT, SIGTERM, uncaught exceptions).
 */

import { unlinkSync, existsSync } from 'node:fs';

/**
 * Set of temporary file paths that need cleanup
 */
const tempFiles = new Set<string>();

/**
 * Flag to prevent multiple cleanup executions
 */
let cleanupInProgress = false;

/**
 * Flag to track if handlers are registered
 */
let handlersRegistered = false;

/**
 * Register a temporary file for cleanup on process exit
 * @param filePath - Absolute path to the temporary file
 */
export function registerTempFile(filePath: string): void {
  tempFiles.add(filePath);

  // Lazy registration of cleanup handlers
  if (!handlersRegistered) {
    registerCleanupHandlers();
    handlersRegistered = true;
  }
}

/**
 * Unregister a temporary file from cleanup (e.g., after manual cleanup)
 * @param filePath - Absolute path to the temporary file
 */
export function unregisterTempFile(filePath: string): void {
  tempFiles.delete(filePath);
}

/**
 * Synchronously clean up all registered temporary files
 * Used during process exit when async operations are not allowed
 */
function cleanupSync(): void {
  if (cleanupInProgress) {
    return;
  }

  cleanupInProgress = true;

  for (const filePath of tempFiles) {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      // Silently fail during cleanup to avoid crashing the exit process
      // In production, you might want to log this to a file
      console.error(`[Cleanup] Failed to delete temp file: ${filePath}`, error);
    }
  }

  tempFiles.clear();
  cleanupInProgress = false;
}

/**
 * Register all cleanup handlers for various exit scenarios
 */
function registerCleanupHandlers(): void {
  // Normal process exit
  process.on('exit', () => {
    cleanupSync();
  });

  // SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    cleanupSync();
    process.exit(130); // Standard exit code for SIGINT
  });

  // SIGTERM (kill command)
  process.on('SIGTERM', () => {
    cleanupSync();
    process.exit(143); // Standard exit code for SIGTERM
  });

  // Uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Fatal] Uncaught exception:', error);
    cleanupSync();
    process.exit(1);
  });

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Fatal] Unhandled rejection at:', promise, 'reason:', reason);
    cleanupSync();
    process.exit(1);
  });
}

/**
 * Get the current count of registered temp files (for testing/debugging)
 */
export function getTempFileCount(): number {
  return tempFiles.size;
}

/**
 * Manually trigger cleanup (for testing purposes)
 * @internal
 */
export function manualCleanup(): void {
  cleanupSync();
}
