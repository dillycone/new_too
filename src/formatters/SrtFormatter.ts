import type { TranscriptFormatter, ParsedTranscript, FormatOptions } from './types.js';
import { formatTimestamp, wrapText } from './parser.js';

/**
 * SubRip (.srt) formatter for transcripts
 * Standard subtitle format supported by most video players
 *
 * Format:
 * 1
 * 00:00:01,000 --> 00:00:05,000
 * First subtitle line
 * Second subtitle line if wrapped
 *
 * 2
 * 00:00:05,000 --> 00:00:10,000
 * Next subtitle
 */
export class SrtFormatter implements TranscriptFormatter {
  readonly formatType = 'srt' as const;
  readonly extension = 'srt';

  format(transcript: ParsedTranscript, options?: FormatOptions): string {
    const maxLineLength = options?.maxLineLength || 42;
    const includeSpeakers = options?.includeSpeakers !== false;
    const lines: string[] = [];

    for (const segment of transcript.segments) {
      // Sequence number (1-based for SRT)
      lines.push(String(segment.index + 1));

      // Timestamp range: HH:MM:SS,mmm --> HH:MM:SS,mmm
      const startTime = formatTimestamp(segment.startMs, 'srt');
      const endTime = formatTimestamp(segment.endMs, 'srt');
      lines.push(`${startTime} --> ${endTime}`);

      // Text content with optional speaker and wrapping
      let text = segment.text;
      if (includeSpeakers && segment.speaker) {
        text = `${segment.speaker}: ${text}`;
      }

      const wrappedLines = wrapText(text, maxLineLength);
      lines.push(...wrappedLines);

      // Blank line separator between subtitles
      lines.push('');
    }

    return lines.join('\n');
  }
}
