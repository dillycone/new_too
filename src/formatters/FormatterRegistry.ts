import type { TranscriptFormatter, OutputFormat } from './types.js';
import { JsonFormatter } from './JsonFormatter.js';
import { SrtFormatter } from './SrtFormatter.js';
import { VttFormatter } from './VttFormatter.js';
import { TextFormatter } from './TextFormatter.js';

/**
 * Registry for all available transcript formatters
 * Provides centralized access to formatters and format detection
 */
export class FormatterRegistry {
  private static formatters = new Map<OutputFormat, TranscriptFormatter>([
    ['json', new JsonFormatter()],
    ['srt', new SrtFormatter()],
    ['vtt', new VttFormatter()],
    ['txt', new TextFormatter()],
  ]);

  /**
   * Get formatter by format type
   * @param format - The output format type
   * @returns The formatter instance, or undefined if not found
   */
  static getFormatter(format: OutputFormat): TranscriptFormatter | undefined {
    return this.formatters.get(format);
  }

  /**
   * Get formatter by file extension
   * @param extension - File extension (with or without leading dot)
   * @returns The formatter instance, or undefined if not found
   */
  static getFormatterByExtension(extension: string): TranscriptFormatter | undefined {
    // Normalize extension: remove leading dot and convert to lowercase
    const normalized = extension.replace(/^\./, '').toLowerCase();

    // Map common extensions to format types
    const extensionMap: Record<string, OutputFormat> = {
      'json': 'json',
      'srt': 'srt',
      'vtt': 'vtt',
      'txt': 'txt',
      'text': 'txt',
    };

    const format = extensionMap[normalized];
    return format ? this.getFormatter(format) : undefined;
  }

  /**
   * Detect format from file path
   * @param filePath - Path to the output file
   * @returns Detected format, or 'txt' as default
   */
  static detectFormat(filePath: string): OutputFormat {
    const match = filePath.match(/\.([^.]+)$/);
    if (!match) {
      return 'txt'; // Default to text if no extension
    }

    const extension = match[1]!.toLowerCase();
    const extensionMap: Record<string, OutputFormat> = {
      'json': 'json',
      'srt': 'srt',
      'vtt': 'vtt',
      'txt': 'txt',
      'text': 'txt',
    };

    return extensionMap[extension] || 'txt';
  }

  /**
   * Get the default file extension for a format
   * @param format - The output format type
   * @returns File extension without leading dot
   */
  static getExtension(format: OutputFormat): string {
    const formatter = this.getFormatter(format);
    return formatter?.extension || 'txt';
  }

  /**
   * Get all available formats
   * @returns Array of supported format types
   */
  static getAvailableFormats(): OutputFormat[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Check if a format is supported
   * @param format - Format to check
   * @returns True if the format is supported
   */
  static isFormatSupported(format: string): format is OutputFormat {
    return this.formatters.has(format as OutputFormat);
  }

  /**
   * Register a custom formatter
   * Allows for extending the system with additional formats
   * @param formatter - The formatter to register
   */
  static registerFormatter(formatter: TranscriptFormatter): void {
    this.formatters.set(formatter.formatType, formatter);
  }
}
