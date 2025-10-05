/**
 * Tests for JSON formatter
 */

import { describe, it, expect } from 'vitest';
import { JsonFormatter } from '../JsonFormatter.js';
import { createMockTranscript, createMockSegments } from '../../../tests/helpers/mockFactories.js';

describe('JsonFormatter', () => {
  let formatter: JsonFormatter;

  beforeEach(() => {
    formatter = new JsonFormatter();
  });

  it('should have correct format type and extension', () => {
    expect(formatter.formatType).toBe('json');
    expect(formatter.extension).toBe('json');
  });

  describe('format', () => {
    it('should format transcript with pretty print by default', () => {
      const transcript = createMockTranscript();
      const result = formatter.format(transcript);

      expect(result).toContain('\n'); // Pretty printed
      expect(result).toContain('  '); // Indentation

      const parsed = JSON.parse(result);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.segments).toBeDefined();
    });

    it('should include metadata in output', () => {
      const transcript = createMockTranscript({
        metadata: {
          durationMs: 15000,
          speakers: ['Speaker 1', 'Speaker 2'],
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.metadata).toMatchObject({
        durationMs: 15000,
        speakers: ['Speaker 1', 'Speaker 2'],
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should include all segment data', () => {
      const segments = createMockSegments(2);
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments).toHaveLength(2);
      expect(parsed.segments[0]).toMatchObject({
        index: 0,
        startMs: 0,
        endMs: 5000,
        startTime: '00:00:00.000',
        endTime: '00:00:05.000',
        duration: 5000,
        speaker: 'Speaker 1',
        text: 'This is segment 1.',
      });
    });

    it('should calculate duration for each segment', () => {
      const segments = [
        {
          index: 0,
          startMs: 1000,
          endMs: 6000,
          text: 'Test',
          speaker: 'Speaker 1',
        },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].duration).toBe(5000);
    });

    it('should format timestamps correctly', () => {
      const segments = [
        {
          index: 0,
          startMs: 0,
          endMs: 1000,
          text: 'Test',
        },
        {
          index: 1,
          startMs: 65123, // 1 min, 5 sec, 123 ms
          endMs: 125456, // 2 min, 5 sec, 456 ms
          text: 'Test 2',
        },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].startTime).toBe('00:00:00.000');
      expect(parsed.segments[0].endTime).toBe('00:00:01.000');
      expect(parsed.segments[1].startTime).toBe('00:01:05.123');
      expect(parsed.segments[1].endTime).toBe('00:02:05.456');
    });

    it('should include speakers when includeSpeakers is not false', () => {
      const segments = [
        { index: 0, startMs: 0, endMs: 5000, text: 'Test', speaker: 'John' },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].speaker).toBe('John');
    });

    it('should exclude speakers when includeSpeakers is false', () => {
      const segments = [
        { index: 0, startMs: 0, endMs: 5000, text: 'Test', speaker: 'John' },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript, { includeSpeakers: false });
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].speaker).toBeUndefined();
    });

    it('should handle segments without speakers', () => {
      const segments = [
        { index: 0, startMs: 0, endMs: 5000, text: 'Test' },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].speaker).toBeUndefined();
    });

    it('should include additional metadata from options', () => {
      const transcript = createMockTranscript();

      const result = formatter.format(transcript, {
        metadata: {
          title: 'Test Transcript',
          author: 'Test Author',
        },
      });
      const parsed = JSON.parse(result);

      expect(parsed.metadata.title).toBe('Test Transcript');
      expect(parsed.metadata.author).toBe('Test Author');
    });

    it('should merge metadata from options with transcript metadata', () => {
      const transcript = createMockTranscript({
        metadata: {
          durationMs: 15000,
          speakers: ['Speaker 1'],
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = formatter.format(transcript, {
        metadata: {
          title: 'Test Title',
        },
      });
      const parsed = JSON.parse(result);

      expect(parsed.metadata).toMatchObject({
        durationMs: 15000,
        speakers: ['Speaker 1'],
        createdAt: '2024-01-01T00:00:00.000Z',
        title: 'Test Title',
      });
    });

    it('should minify output when prettyPrint is false', () => {
      const transcript = createMockTranscript();

      const result = formatter.format(transcript, { prettyPrint: false });

      expect(result).not.toContain('\n');
      expect(result).not.toContain('  ');

      // Should still be valid JSON
      const parsed = JSON.parse(result);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.segments).toBeDefined();
    });

    it('should handle empty segments array', () => {
      const transcript = createMockTranscript({ segments: [] });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments).toEqual([]);
      // Duration may be NaN or -Infinity for empty segments
      expect(parsed.metadata.durationMs).toBeDefined();
    });

    it('should handle large number of segments', () => {
      const segments = createMockSegments(1000);
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments).toHaveLength(1000);
    });

    it('should handle special characters in text', () => {
      const segments = [
        {
          index: 0,
          startMs: 0,
          endMs: 5000,
          text: 'Text with "quotes" and \n newlines and \t tabs',
          speaker: 'Speaker 1',
        },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].text).toBe('Text with "quotes" and \n newlines and \t tabs');
    });

    it('should handle unicode characters', () => {
      const segments = [
        {
          index: 0,
          startMs: 0,
          endMs: 5000,
          text: 'Unicode: 你好 🎉 café',
          speaker: 'Speaker 1',
        },
      ];
      const transcript = createMockTranscript({ segments });

      const result = formatter.format(transcript);
      const parsed = JSON.parse(result);

      expect(parsed.segments[0].text).toBe('Unicode: 你好 🎉 café');
    });
  });
});
