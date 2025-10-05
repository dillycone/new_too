/**
 * Output format types for transcripts
 */
export type OutputFormat = 'json' | 'srt' | 'vtt' | 'txt';

/**
 * Represents a single segment of transcript with timestamp and content
 */
export interface TranscriptSegment {
  /** Sequence number of the segment */
  index: number;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Speaker identifier (e.g., "Speaker 1", "Speaker 2") */
  speaker?: string;
  /** The actual text content of the segment */
  text: string;
}

/**
 * Structured representation of a parsed transcript
 */
export interface ParsedTranscript {
  /** Array of transcript segments */
  segments: TranscriptSegment[];
  /** Original raw text */
  rawText: string;
  /** Metadata about the transcript */
  metadata?: {
    /** Total duration in milliseconds */
    durationMs?: number;
    /** List of unique speakers */
    speakers?: string[];
    /** Original file path or source */
    source?: string;
    /** Timestamp when the transcript was created */
    createdAt?: string;
  };
}

/**
 * Options for formatting transcripts
 */
export interface FormatOptions {
  /** Maximum characters per line for subtitle formats (SRT/VTT) */
  maxLineLength?: number;
  /** Whether to include speaker labels in output */
  includeSpeakers?: boolean;
  /** Pretty print JSON output */
  prettyPrint?: boolean;
  /** Custom metadata to include */
  metadata?: Record<string, unknown>;
}

/**
 * Interface that all formatters must implement
 */
export interface TranscriptFormatter {
  /** The format this formatter produces */
  readonly formatType: OutputFormat;

  /** File extension for this format (without dot) */
  readonly extension: string;

  /**
   * Format a parsed transcript into the target format
   * @param transcript - The parsed transcript to format
   * @param options - Optional formatting options
   * @returns Formatted string output
   */
  format(transcript: ParsedTranscript, options?: FormatOptions): string;
}
