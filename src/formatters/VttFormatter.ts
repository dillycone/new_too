import type { TranscriptFormatter, ParsedTranscript, FormatOptions } from './types.js';
import { formatTimestamp, wrapText } from './parser.js';

/**
 * WebVTT (.vtt) formatter for transcripts
 * Modern web-native subtitle format with support for styling and metadata
 *
 * Format:
 * WEBVTT
 *
 * 00:00:01.000 --> 00:00:05.000
 * First subtitle line
 * Second subtitle line if wrapped
 *
 * 00:00:05.000 --> 00:00:10.000
 * Next subtitle
 */
export class VttFormatter implements TranscriptFormatter {
  readonly formatType = 'vtt' as const;
  readonly extension = 'vtt';

  format(transcript: ParsedTranscript, options?: FormatOptions): string {
    const maxLineLength = options?.maxLineLength || 42;
    const includeSpeakers = options?.includeSpeakers !== false;
    const lines: string[] = [];

    // WebVTT signature (required first line)
    lines.push('WEBVTT');
    lines.push('');

    // Add metadata as NOTE if present
    if (transcript.metadata) {
      const metadata = transcript.metadata;
      if (metadata.durationMs || metadata.speakers?.length || metadata.source) {
        lines.push('NOTE');
        if (metadata.source) {
          lines.push(`Source: ${metadata.source}`);
        }
        if (metadata.durationMs) {
          const duration = this.formatDuration(metadata.durationMs);
          lines.push(`Duration: ${duration}`);
        }
        if (metadata.speakers && metadata.speakers.length > 0) {
          lines.push(`Speakers: ${metadata.speakers.join(', ')}`);
        }
        if (metadata.createdAt) {
          lines.push(`Created: ${metadata.createdAt}`);
        }
        lines.push('');
      }
    }

    for (const segment of transcript.segments) {
      // Timestamp range: HH:MM:SS.mmm --> HH:MM:SS.mmm
      const startTime = formatTimestamp(segment.startMs, 'vtt');
      const endTime = formatTimestamp(segment.endMs, 'vtt');
      lines.push(`${startTime} --> ${endTime}`);

      // Text content with optional speaker and wrapping
      let text = segment.text;
      if (includeSpeakers && segment.speaker) {
        // Use <v> tag for speaker in WebVTT
        text = `<v ${segment.speaker}>${text}</v>`;
      }

      const wrappedLines = wrapText(text, maxLineLength);
      lines.push(...wrappedLines);

      // Blank line separator between cues
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
