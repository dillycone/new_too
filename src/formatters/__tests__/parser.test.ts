/**
 * Tests for transcript parser utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseTimestamp,
  formatTimestamp,
  wrapText,
  parseRawTranscript,
  estimateSegmentDuration,
} from '../parser.js';

describe('parseTimestamp', () => {
  it('should parse timestamp in [hh:mm:ss] format', () => {
    expect(parseTimestamp('[01:23:45]')).toBe((1 * 3600 + 23 * 60 + 45) * 1000);
    expect(parseTimestamp('[00:05:30]')).toBe(5 * 60 * 1000 + 30 * 1000);
  });

  it('should parse timestamp in [mm:ss] format', () => {
    expect(parseTimestamp('[12:34]')).toBe(12 * 60 * 1000 + 34 * 1000);
    expect(parseTimestamp('[05:00]')).toBe(5 * 60 * 1000);
  });

  it('should handle timestamps without brackets', () => {
    expect(parseTimestamp('01:23:45')).toBe((1 * 3600 + 23 * 60 + 45) * 1000);
    expect(parseTimestamp('12:34')).toBe(12 * 60 * 1000 + 34 * 1000);
  });

  it('should handle timestamps with whitespace', () => {
    expect(parseTimestamp(' [01:23:45] ')).toBe((1 * 3600 + 23 * 60 + 45) * 1000);
    expect(parseTimestamp(' 12:34 ')).toBe(12 * 60 * 1000 + 34 * 1000);
  });

  it('should return null for invalid timestamps', () => {
    expect(parseTimestamp('invalid')).toBeNull();
    expect(parseTimestamp('[12]')).toBeNull();
    expect(parseTimestamp('[1:2:3:4]')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });

  it('should handle edge cases', () => {
    expect(parseTimestamp('[00:00:00]')).toBe(0);
    expect(parseTimestamp('[23:59:59]')).toBe((23 * 3600 + 59 * 60 + 59) * 1000);
  });
});

describe('formatTimestamp', () => {
  it('should format timestamp in simple format', () => {
    expect(formatTimestamp(0, 'simple')).toBe('[00:00:00]');
    expect(formatTimestamp(5000, 'simple')).toBe('[00:00:05]');
    expect(formatTimestamp(65000, 'simple')).toBe('[00:01:05]');
    expect(formatTimestamp(3665000, 'simple')).toBe('[01:01:05]');
  });

  it('should format timestamp in SRT format', () => {
    expect(formatTimestamp(0, 'srt')).toBe('00:00:00,000');
    expect(formatTimestamp(5123, 'srt')).toBe('00:00:05,123');
    expect(formatTimestamp(65456, 'srt')).toBe('00:01:05,456');
  });

  it('should format timestamp in VTT format', () => {
    expect(formatTimestamp(0, 'vtt')).toBe('00:00:00.000');
    expect(formatTimestamp(5123, 'vtt')).toBe('00:00:05.123');
    expect(formatTimestamp(65456, 'vtt')).toBe('00:01:05.456');
  });

  it('should handle milliseconds correctly', () => {
    expect(formatTimestamp(1, 'srt')).toBe('00:00:00,001');
    expect(formatTimestamp(999, 'srt')).toBe('00:00:00,999');
    expect(formatTimestamp(1001, 'srt')).toBe('00:00:01,001');
  });

  it('should pad numbers correctly', () => {
    expect(formatTimestamp(1000, 'simple')).toBe('[00:00:01]');
    expect(formatTimestamp(60000, 'simple')).toBe('[00:01:00]');
    expect(formatTimestamp(3600000, 'simple')).toBe('[01:00:00]');
  });
});

describe('wrapText', () => {
  it('should not wrap text shorter than maxLength', () => {
    expect(wrapText('Short text', 42)).toEqual(['Short text']);
  });

  it('should wrap text at word boundaries', () => {
    const text = 'This is a long sentence that needs to be wrapped';
    const result = wrapText(text, 20);

    expect(result.length).toBeGreaterThan(1);
    result.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(20);
    });
  });

  it('should handle single long word', () => {
    const longWord = 'verylongwordthatexceedsmaxlength';
    const result = wrapText(longWord, 10);

    expect(result.length).toBeGreaterThan(1);
    result.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(10);
    });
  });

  it('should use default maxLength of 42', () => {
    const text = 'This is a test sentence that will be wrapped at the default length';
    const result = wrapText(text);

    result.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(42);
    });
  });

  it('should handle empty string', () => {
    expect(wrapText('')).toEqual(['']);
  });

  it('should preserve words when possible', () => {
    const text = 'Hello world this is a test';
    const result = wrapText(text, 15);

    result.forEach((line) => {
      expect(line.trim()).toBe(line); // No leading/trailing spaces
    });
  });
});

describe('parseRawTranscript', () => {
  it('should parse basic transcript with timestamps and speakers', () => {
    const rawText = `[00:00:00] Speaker 1: Hello, welcome to the show.
[00:00:05] Speaker 2: Thanks for having me!
[00:00:10] Speaker 1: Let's get started.`;

    const result = parseRawTranscript(rawText);

    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toMatchObject({
      index: 0,
      startMs: 0,
      endMs: 5000,
      speaker: 'Speaker 1',
      text: 'Hello, welcome to the show.',
    });
    expect(result.segments[1]).toMatchObject({
      index: 1,
      startMs: 5000,
      endMs: 10000,
      speaker: 'Speaker 2',
      text: 'Thanks for having me!',
    });
  });

  it('should parse transcript without speakers', () => {
    const rawText = `[00:00:00] This is the first line.
[00:00:05] This is the second line.`;

    const result = parseRawTranscript(rawText);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.speaker).toBeUndefined();
    expect(result.segments[1]?.speaker).toBeUndefined();
  });

  it('should handle multi-line segments', () => {
    const rawText = `[00:00:00] Speaker 1: This is a long segment
that spans multiple lines
and continues here.
[00:00:10] Speaker 2: Next segment.`;

    const result = parseRawTranscript(rawText);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.text).toContain('multiple lines');
    expect(result.segments[0]?.text).toContain('continues here');
  });

  it('should calculate metadata correctly', () => {
    const rawText = `[00:00:00] Speaker 1: First.
[00:00:05] Speaker 2: Second.
[00:00:10] Speaker 1: Third.`;

    const result = parseRawTranscript(rawText);

    expect(result.metadata.speakers).toEqual(['Speaker 1', 'Speaker 2']);
    expect(result.metadata.durationMs).toBeGreaterThan(10000);
    expect(result.metadata.createdAt).toBeDefined();
  });

  it('should handle empty lines and whitespace', () => {
    const rawText = `[00:00:00] Speaker 1: First.

[00:00:05] Speaker 2: Second.

  `;

    const result = parseRawTranscript(rawText);

    expect(result.segments).toHaveLength(2);
  });

  it('should handle timestamps in [mm:ss] format', () => {
    const rawText = `[01:30] Speaker 1: First.
[02:45] Speaker 2: Second.`;

    const result = parseRawTranscript(rawText);

    expect(result.segments[0]?.startMs).toBe(90000); // 1:30 = 90 seconds
    expect(result.segments[1]?.startMs).toBe(165000); // 2:45 = 165 seconds
  });

  it('should skip lines with invalid timestamps', () => {
    const rawText = `[00:00:00] Speaker 1: Valid.
Invalid line without timestamp
[00:00:05] Speaker 2: Also valid.`;

    const result = parseRawTranscript(rawText);

    // Invalid line should be appended to previous segment
    expect(result.segments[0]?.text).toContain('Invalid line without timestamp');
  });

  it('should handle last segment with default duration', () => {
    const rawText = `[00:00:00] Speaker 1: Only segment.`;

    const result = parseRawTranscript(rawText);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.endMs).toBe(5000); // Default 5 second duration
  });

  it('should preserve raw text', () => {
    const rawText = `[00:00:00] Speaker 1: Test.`;

    const result = parseRawTranscript(rawText);

    expect(result.rawText).toBe(rawText);
  });
});

describe('estimateSegmentDuration', () => {
  it('should estimate duration based on word count', () => {
    // 150 words per minute = 2.5 words per second
    const text = Array(150).fill('word').join(' '); // 150 words

    const duration = estimateSegmentDuration(text);

    expect(duration).toBe(60000); // Should be ~60 seconds for 150 words
  });

  it('should handle short text', () => {
    const text = 'Short text';

    const duration = estimateSegmentDuration(text);

    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(5000); // Less than 5 seconds for 2 words
  });

  it('should handle empty text', () => {
    const duration = estimateSegmentDuration('');

    // Empty text may result in minimal duration due to rounding
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(1000); // Less than 1 second
  });

  it('should round up to nearest millisecond', () => {
    const text = 'one'; // 1 word

    const duration = estimateSegmentDuration(text);

    expect(duration).toBeGreaterThan(0);
    expect(Number.isInteger(duration)).toBe(true);
  });
});
