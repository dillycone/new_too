import type { ParsedTranscript, TranscriptSegment } from './types.js';

/**
 * Parses a timestamp in [hh:mm:ss] or [mm:ss] format to milliseconds
 * @param timestamp - Timestamp string like "[01:23:45]" or "[12:34]"
 * @returns Time in milliseconds, or null if parsing fails
 */
export function parseTimestamp(timestamp: string): number | null {
  // Remove brackets and whitespace
  const cleaned = timestamp.replace(/[\[\]\s]/g, '');

  // Match hh:mm:ss or mm:ss patterns
  const match = cleaned.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2]!, 10);
  const seconds = parseInt(match[3]!, 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Formats milliseconds to timestamp string
 * @param ms - Time in milliseconds
 * @param format - Output format ('srt' or 'vtt' for HH:MM:SS,mmm or HH:MM:SS.mmm)
 * @returns Formatted timestamp string
 */
export function formatTimestamp(ms: number, format: 'srt' | 'vtt' | 'simple' = 'simple'): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(milliseconds).padStart(3, '0');

  if (format === 'srt') {
    return `${hh}:${mm}:${ss},${mmm}`;
  } else if (format === 'vtt') {
    return `${hh}:${mm}:${ss}.${mmm}`;
  } else {
    // Simple format: [hh:mm:ss]
    return `[${hh}:${mm}:${ss}]`;
  }
}

/**
 * Wraps text to fit within a maximum line length
 * Tries to break at word boundaries when possible
 * @param text - Text to wrap
 * @param maxLength - Maximum characters per line
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, maxLength: number = 42): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxLength) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // Handle words longer than maxLength
      if (word.length > maxLength) {
        // Split long word
        let remainingWord = word;
        while (remainingWord.length > maxLength) {
          lines.push(remainingWord.substring(0, maxLength));
          remainingWord = remainingWord.substring(maxLength);
        }
        currentLine = remainingWord;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

/**
 * Parses raw transcript text from Gemini into structured format
 * Expected format:
 * [00:01:23] Speaker 1: Text here
 * [00:01:45] Speaker 2: More text
 *
 * @param rawText - Raw transcript text with timestamps and optional speakers
 * @returns Parsed transcript with segments
 */
export function parseRawTranscript(rawText: string): ParsedTranscript {
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  const segments: TranscriptSegment[] = [];
  const speakersSet = new Set<string>();

  let currentSegment: Partial<TranscriptSegment> | null = null;
  let segmentIndex = 0;

  for (const line of lines) {
    // Match timestamp at start of line: [hh:mm:ss] or [mm:ss]
    const timestampMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);

    if (timestampMatch) {
      // Save previous segment if exists
      if (currentSegment && currentSegment.text) {
        const segment: TranscriptSegment = {
          index: segmentIndex++,
          startMs: currentSegment.startMs!,
          endMs: currentSegment.startMs!, // Will be updated when we find next timestamp
          text: currentSegment.text.trim(),
        };
        if (currentSegment.speaker) {
          segment.speaker = currentSegment.speaker;
        }
        segments.push(segment);
      }

      const timestamp = parseTimestamp(timestampMatch[0]);
      if (timestamp === null) {
        continue; // Skip invalid timestamps
      }

      // Update end time of previous segment
      if (segments.length > 0) {
        segments[segments.length - 1]!.endMs = timestamp;
      }

      // Extract text after timestamp
      let remainingText = line.substring(timestampMatch[0].length).trim();

      // Check for speaker label: "Speaker 1:", "John:", etc.
      let speaker: string | undefined;
      const speakerMatch = remainingText.match(/^([^:]+):\s*/);
      if (speakerMatch) {
        speaker = speakerMatch[1]!.trim();
        speakersSet.add(speaker);
        remainingText = remainingText.substring(speakerMatch[0].length);
      }

      currentSegment = {
        startMs: timestamp,
        text: remainingText,
        ...(speaker && { speaker }),
      };
    } else if (currentSegment) {
      // Continuation of current segment
      currentSegment.text = `${currentSegment.text || ''} ${line}`.trim();
    }
  }

  // Save final segment
  if (currentSegment && currentSegment.text) {
    const segment: TranscriptSegment = {
      index: segmentIndex++,
      startMs: currentSegment.startMs!,
      endMs: currentSegment.startMs! + 5000, // Default 5 second duration for last segment
      text: currentSegment.text.trim(),
    };
    if (currentSegment.speaker) {
      segment.speaker = currentSegment.speaker;
    }
    segments.push(segment);
  }

  // Calculate total duration
  const durationMs = segments.length > 0
    ? Math.max(...segments.map(s => s.endMs))
    : 0;

  return {
    segments,
    rawText,
    metadata: {
      durationMs,
      speakers: Array.from(speakersSet).sort(),
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Estimates segment end times based on text length when not explicitly provided
 * Uses a simple heuristic: ~150 words per minute average speaking rate
 * @param segment - Segment to estimate duration for
 * @returns Estimated duration in milliseconds
 */
export function estimateSegmentDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const wordsPerMinute = 150;
  const minutes = words / wordsPerMinute;
  return Math.ceil(minutes * 60 * 1000);
}
