import type { TranscriptFormatter, ParsedTranscript, FormatOptions } from './types.js';

/**
 * JSON formatter for transcripts
 * Outputs structured JSON with all metadata and segments
 */
export class JsonFormatter implements TranscriptFormatter {
  readonly formatType = 'json' as const;
  readonly extension = 'json';

  format(transcript: ParsedTranscript, options?: FormatOptions): string {
    const output = {
      metadata: {
        ...transcript.metadata,
        ...(options?.metadata || {}),
      },
      segments: transcript.segments.map(segment => ({
        index: segment.index,
        startMs: segment.startMs,
        endMs: segment.endMs,
        startTime: this.formatTime(segment.startMs),
        endTime: this.formatTime(segment.endMs),
        duration: segment.endMs - segment.startMs,
        ...(options?.includeSpeakers !== false && segment.speaker && { speaker: segment.speaker }),
        text: segment.text,
      })),
    };

    return options?.prettyPrint !== false
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);
  }

  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }
}
