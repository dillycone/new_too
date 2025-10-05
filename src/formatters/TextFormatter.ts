import type { TranscriptFormatter, ParsedTranscript, FormatOptions } from './types.js';

/**
 * Plain text formatter for transcripts
 * Simple passthrough that returns the raw transcript text
 * Useful for maintaining backward compatibility or simple text output
 */
export class TextFormatter implements TranscriptFormatter {
  readonly formatType = 'txt' as const;
  readonly extension = 'txt';

  format(transcript: ParsedTranscript, _options?: FormatOptions): string {
    // For plain text, just return the original raw text
    // This maintains backward compatibility with existing behavior
    return transcript.rawText;
  }
}
