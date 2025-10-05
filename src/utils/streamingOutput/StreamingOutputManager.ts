/**
 * StreamingOutputManager - Manages large outputs with automatic memory/streaming mode switching
 *
 * Features:
 * - Automatic mode switching at 5MB threshold
 * - Memory mode for small outputs (< 5MB)
 * - Streaming mode for large outputs (>= 5MB) with temp file management
 * - Progress tracking and reporting
 * - Automatic cleanup on disposal
 * - Production-ready error handling
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWriteStream, promises as fs, WriteStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type {
  StreamingOutputOptions,
  StreamProgress,
  StreamingOutputController,
} from './types.js';
import { registerTempFile, unregisterTempFile } from './cleanupHandler.js';

/**
 * Default memory threshold: 5MB in bytes
 */
const DEFAULT_MEMORY_THRESHOLD = 5 * 1024 * 1024; // 5MB

/**
 * Main class for managing streaming output with automatic mode switching
 */
export class StreamingOutputManager implements StreamingOutputController {
  private memoryThreshold: number;
  private onProgress: ((progress: StreamProgress) => void) | undefined;
  private verbose: boolean;

  private mode: 'memory' | 'streaming' = 'memory';
  private memoryBuffer: string[] = [];
  private tempFilePath: string | null = null;
  private writeStream: WriteStream | null = null;

  private bytesWritten = 0;
  private chunksProcessed = 0;
  private thresholdExceeded = false;
  private disposed = false;

  constructor(options: StreamingOutputOptions = {}) {
    this.memoryThreshold = options.memoryThreshold ?? DEFAULT_MEMORY_THRESHOLD;
    this.onProgress = options.onProgress ?? undefined;
    this.verbose = options.verbose ?? false;

    if (this.verbose) {
      console.log(`[StreamingOutput] Initialized with ${this.formatBytes(this.memoryThreshold)} threshold`);
    }
  }

  /**
   * Write a chunk of data to the output
   * Automatically switches to streaming mode if threshold is exceeded
   */
  public write(chunk: string): void {
    if (this.disposed) {
      throw new Error('StreamingOutputManager has been disposed');
    }

    const chunkBytes = Buffer.byteLength(chunk, 'utf8');
    const projectedSize = this.bytesWritten + chunkBytes;

    // Check if we need to switch to streaming mode
    if (this.mode === 'memory' && projectedSize >= this.memoryThreshold) {
      this.switchToStreamingMode();
    }

    // Write the chunk based on current mode
    if (this.mode === 'memory') {
      this.memoryBuffer.push(chunk);
    } else {
      this.writeToStream(chunk);
    }

    this.bytesWritten += chunkBytes;
    this.chunksProcessed++;

    // Report progress
    this.reportProgress();
  }

  /**
   * Finalize the output and return the complete data
   */
  public async finalize(): Promise<string> {
    if (this.disposed) {
      throw new Error('StreamingOutputManager has been disposed');
    }

    try {
      if (this.mode === 'memory') {
        // Simple concatenation for memory mode
        const result = this.memoryBuffer.join('');

        if (this.verbose) {
          console.log(`[StreamingOutput] Finalized in memory mode: ${this.formatBytes(this.bytesWritten)}`);
        }

        return result;
      } else {
        // Read from temp file for streaming mode
        if (!this.tempFilePath) {
          throw new Error('Streaming mode active but no temp file path available');
        }

        // Close the write stream first
        if (this.writeStream) {
          await this.closeWriteStream();
        }

        // Read the complete file
        const result = await fs.readFile(this.tempFilePath, 'utf8');

        if (this.verbose) {
          console.log(`[StreamingOutput] Finalized from temp file: ${this.formatBytes(this.bytesWritten)}`);
        }

        return result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to finalize streaming output: ${message}`);
    }
  }

  /**
   * Get current progress information
   */
  public getProgress(): StreamProgress {
    const progress: StreamProgress = {
      mode: this.mode,
      bytesWritten: this.bytesWritten,
      chunksProcessed: this.chunksProcessed,
      thresholdExceeded: this.thresholdExceeded,
    };

    if (this.tempFilePath !== null) {
      progress.tempFilePath = this.tempFilePath;
    }

    return progress;
  }

  /**
   * Get the current output mode
   */
  public getMode(): 'memory' | 'streaming' {
    return this.mode;
  }

  /**
   * Get the temporary file path if in streaming mode
   */
  public getTempFilePath(): string | null {
    return this.tempFilePath;
  }

  /**
   * Dispose of resources and cleanup temp files
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    try {
      // Close write stream if open
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }

      // Clean up temp file synchronously
      if (this.tempFilePath) {
        this.cleanupTempFileSync();
      }

      // Clear memory buffer
      this.memoryBuffer = [];

      this.disposed = true;

      if (this.verbose) {
        console.log('[StreamingOutput] Disposed and cleaned up resources');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[StreamingOutput] Error during disposal: ${message}`);
    }
  }

  /**
   * Switch from memory mode to streaming mode
   */
  private switchToStreamingMode(): void {
    try {
      if (this.verbose) {
        console.log(`[StreamingOutput] Switching to streaming mode (threshold exceeded: ${this.formatBytes(this.memoryThreshold)})`);
      }

      // Create temp file
      this.tempFilePath = this.createTempFilePath();
      registerTempFile(this.tempFilePath);

      // Create write stream
      this.writeStream = createWriteStream(this.tempFilePath, {
        encoding: 'utf8',
        flags: 'w',
      });

      // Handle stream errors
      this.writeStream.on('error', (error) => {
        console.error('[StreamingOutput] Write stream error:', error);
      });

      // Write existing memory buffer to file
      if (this.memoryBuffer.length > 0) {
        const existingData = this.memoryBuffer.join('');
        this.writeStream.write(existingData);
        this.memoryBuffer = []; // Clear memory buffer
      }

      this.mode = 'streaming';
      this.thresholdExceeded = true;

      if (this.verbose) {
        console.log(`[StreamingOutput] Streaming to temp file: ${this.tempFilePath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to switch to streaming mode: ${message}`);
    }
  }

  /**
   * Write data to the stream
   */
  private writeToStream(chunk: string): void {
    if (!this.writeStream) {
      throw new Error('Write stream not initialized');
    }

    const canContinue = this.writeStream.write(chunk);

    if (!canContinue) {
      // Handle backpressure (stream buffer is full)
      // In this implementation, we let Node.js handle it internally
      // For more advanced scenarios, you could pause/resume the source
    }
  }

  /**
   * Close the write stream
   */
  private async closeWriteStream(): Promise<void> {
    if (!this.writeStream) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.writeStream!.end((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          this.writeStream = null;
          resolve();
        }
      });
    });
  }

  /**
   * Create a unique temporary file path
   */
  private createTempFilePath(): string {
    const randomSuffix = randomBytes(8).toString('hex');
    const fileName = `streaming-output-${randomSuffix}.tmp`;
    return join(tmpdir(), fileName);
  }

  /**
   * Clean up temporary file synchronously
   */
  private cleanupTempFileSync(): void {
    if (!this.tempFilePath) {
      return;
    }

    try {
      const { unlinkSync, existsSync } = require('node:fs');

      if (existsSync(this.tempFilePath)) {
        unlinkSync(this.tempFilePath);
      }

      unregisterTempFile(this.tempFilePath);

      if (this.verbose) {
        console.log(`[StreamingOutput] Cleaned up temp file: ${this.tempFilePath}`);
      }

      this.tempFilePath = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[StreamingOutput] Failed to cleanup temp file: ${message}`);
    }
  }

  /**
   * Report progress to callback if registered
   */
  private reportProgress(): void {
    if (this.onProgress) {
      const progress = this.getProgress();
      this.onProgress(progress);
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}
