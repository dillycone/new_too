/**
 * Streaming output management types for handling large outputs
 * and preventing out-of-memory errors.
 */

/**
 * Options for configuring the streaming output manager
 */
export interface StreamingOutputOptions {
  /**
   * Memory threshold in bytes (default: 5MB)
   * When output exceeds this size, streaming mode is activated
   */
  memoryThreshold?: number;

  /**
   * Callback for progress updates during streaming
   */
  onProgress?: (progress: StreamProgress) => void;

  /**
   * Base name for temporary files (random suffix will be added)
   */
  tempFileBaseName?: string;

  /**
   * Whether to enable verbose logging
   */
  verbose?: boolean;
}

/**
 * Progress information for streaming operations
 */
export interface StreamProgress {
  /**
   * Current mode: 'memory' for small outputs, 'streaming' for large outputs
   */
  mode: 'memory' | 'streaming';

  /**
   * Total bytes written so far
   */
  bytesWritten: number;

  /**
   * Number of chunks processed
   */
  chunksProcessed: number;

  /**
   * Path to temporary file (only in streaming mode)
   */
  tempFilePath?: string;

  /**
   * Whether the memory threshold was exceeded
   */
  thresholdExceeded: boolean;
}

/**
 * Controller interface for managing streaming output
 */
export interface StreamingOutputController {
  /**
   * Write a chunk of data to the output
   */
  write(chunk: string): void;

  /**
   * Finalize the output and return the complete data
   * In streaming mode, reads from the temp file
   */
  finalize(): Promise<string>;

  /**
   * Get current progress information
   */
  getProgress(): StreamProgress;

  /**
   * Get the current output mode
   */
  getMode(): 'memory' | 'streaming';

  /**
   * Dispose of resources and cleanup temp files
   */
  dispose(): void;

  /**
   * Get the temporary file path if in streaming mode
   */
  getTempFilePath(): string | null;
}
