# Transcript Formatters

A comprehensive output format system for transcripts supporting JSON, SRT, VTT, and plain text formats.

## Overview

The formatter system provides a flexible, extensible architecture for converting raw transcripts (with timestamps and speaker labels) into various output formats. All formatters implement a common interface, making it easy to add new formats in the future.

## Supported Formats

### 1. Plain Text (.txt)
**Extension:** `.txt`

Simple passthrough format that preserves the original transcript structure with timestamps and speaker labels.

**Use cases:**
- Quick review and editing
- Direct compatibility with text editors
- Backward compatibility with existing workflows

**Example:**
```
[00:00:05] Speaker 1: Welcome to today's podcast.
[00:00:12] Speaker 2: Thanks for having me.
```

### 2. JSON (.json)
**Extension:** `.json`

Structured format with complete metadata and segment information.

**Use cases:**
- API integration
- Data analysis and processing
- Machine-readable output
- Preserving all metadata

**Features:**
- Rich metadata (duration, speakers, timestamps)
- Precise timing in milliseconds
- Human-readable time strings
- Pretty-printed by default

**Example:**
```json
{
  "metadata": {
    "durationMs": 42000,
    "speakers": ["Speaker 1", "Speaker 2"],
    "createdAt": "2025-10-05T00:00:00.000Z",
    "source": "podcast-episode.mp3"
  },
  "segments": [
    {
      "index": 0,
      "startMs": 5000,
      "endMs": 12000,
      "startTime": "00:00:05.000",
      "endTime": "00:00:12.000",
      "duration": 7000,
      "speaker": "Speaker 1",
      "text": "Welcome to today's podcast."
    }
  ]
}
```

### 3. SubRip (.srt)
**Extension:** `.srt`

Standard subtitle format supported by most video players and editors.

**Use cases:**
- Video subtitles
- Universal compatibility
- Social media captions

**Features:**
- Sequential numbering
- HH:MM:SS,mmm timestamp format
- Automatic text wrapping (42 chars/line by default)
- Speaker labels included in text

**Example:**
```
1
00:00:05,000 --> 00:00:12,000
Speaker 1: Welcome to today's podcast.
We're going to discuss the future of
artificial intelligence.

2
00:00:12,000 --> 00:00:18,000
Speaker 2: Thanks for having me.
```

### 4. WebVTT (.vtt)
**Extension:** `.vtt`

Modern web-native subtitle format with enhanced features.

**Use cases:**
- HTML5 video
- Web applications
- Advanced styling support
- Metadata embedding

**Features:**
- WEBVTT header with metadata
- HH:MM:SS.mmm timestamp format (dot separator)
- Speaker voice tags (`<v Speaker>`)
- NOTE blocks for metadata
- Automatic text wrapping

**Example:**
```
WEBVTT

NOTE
Source: podcast-episode.mp3
Duration: 42s
Speakers: Speaker 1, Speaker 2

00:00:05.000 --> 00:00:12.000
<v Speaker 1>Welcome to today's podcast.</v>

00:00:12.000 --> 00:00:18.000
<v Speaker 2>Thanks for having me.</v>
```

## Configuration

### Environment Variable

Set the default output format using the `OUTPUT_FORMAT` environment variable:

```bash
# Set default format to JSON
export OUTPUT_FORMAT=json

# Set default format to SRT
export OUTPUT_FORMAT=srt

# Set default format to VTT
export OUTPUT_FORMAT=vtt

# Set default format to plain text (default)
export OUTPUT_FORMAT=txt
```

### Programmatic Usage

```typescript
import { FormatterRegistry, parseRawTranscript } from './formatters';

// Parse raw transcript
const parsed = parseRawTranscript(rawText);

// Get formatter
const formatter = FormatterRegistry.getFormatter('json');

// Format with options
const output = formatter.format(parsed, {
  maxLineLength: 42,
  includeSpeakers: true,
  prettyPrint: true
});
```

## Architecture

### Core Components

#### 1. Types (`types.ts`)
- `OutputFormat`: Union type for supported formats
- `TranscriptSegment`: Individual transcript segment structure
- `ParsedTranscript`: Complete transcript with metadata
- `FormatOptions`: Configuration options for formatters
- `TranscriptFormatter`: Interface all formatters implement

#### 2. Parser (`parser.ts`)
Utility functions for parsing and formatting:

- `parseTimestamp(timestamp: string): number | null`
  - Parses `[hh:mm:ss]` format to milliseconds

- `formatTimestamp(ms: number, format: 'srt' | 'vtt' | 'simple'): string`
  - Formats milliseconds to various timestamp formats

- `wrapText(text: string, maxLength: number): string[]`
  - Wraps text to fit within line length constraints

- `parseRawTranscript(rawText: string): ParsedTranscript`
  - Parses raw transcript with timestamps and speakers

- `estimateSegmentDuration(text: string): number`
  - Estimates duration based on word count

#### 3. Formatters
Each formatter implements the `TranscriptFormatter` interface:

- `JsonFormatter`: Structured JSON output
- `SrtFormatter`: SubRip subtitle format
- `VttFormatter`: WebVTT subtitle format
- `TextFormatter`: Plain text passthrough

#### 4. Registry (`FormatterRegistry.ts`)
Central registry for format management:

- `getFormatter(format: OutputFormat): TranscriptFormatter`
- `getFormatterByExtension(extension: string): TranscriptFormatter`
- `detectFormat(filePath: string): OutputFormat`
- `getExtension(format: OutputFormat): string`
- `getAvailableFormats(): OutputFormat[]`
- `isFormatSupported(format: string): boolean`
- `registerFormatter(formatter: TranscriptFormatter)`: Add custom formatters

## Integration

### Post-Processing (`postProcessResult.ts`)

The formatter system integrates with the post-processing pipeline:

```typescript
await finalizeProcessing(baseResult, {
  filePath,
  data: baseResult.data,
  outputFormat: 'json', // Specify format
  formatSource: filePath, // Add source metadata
  // ... other options
});
```

**Process:**
1. Parse raw transcript data
2. Add metadata (source, timestamps, etc.)
3. Get appropriate formatter from registry
4. Format data according to selected format
5. Update file extension automatically
6. Save formatted output

### Wizard Controller (`useWizardController.ts`)

The wizard automatically uses the configured format:

```typescript
// Reads from config.app.outputFormat
const configuredFormat = config.app.outputFormat;
const outputFormat = FormatterRegistry.isFormatSupported(configuredFormat)
  ? configuredFormat
  : 'txt';
```

## Format Options

### Common Options

```typescript
interface FormatOptions {
  maxLineLength?: number;      // Max chars per line (default: 42)
  includeSpeakers?: boolean;   // Include speaker labels (default: true)
  prettyPrint?: boolean;       // Pretty print JSON (default: true)
  metadata?: Record<string, unknown>; // Custom metadata
}
```

### Format-Specific Behavior

**JSON:**
- `prettyPrint`: 2-space indentation when true
- `includeSpeakers`: Conditionally include speaker field
- `metadata`: Merged with transcript metadata

**SRT/VTT:**
- `maxLineLength`: Controls text wrapping
- `includeSpeakers`: Prepends "Speaker: " to text

**TXT:**
- Options ignored, returns raw text

## Adding Custom Formatters

Create a new formatter by implementing the `TranscriptFormatter` interface:

```typescript
import type { TranscriptFormatter, ParsedTranscript, FormatOptions } from './types';

export class CustomFormatter implements TranscriptFormatter {
  readonly format = 'custom' as const;
  readonly extension = 'custom';

  format(transcript: ParsedTranscript, options?: FormatOptions): string {
    // Implement formatting logic
    return formattedOutput;
  }
}
```

Register the formatter:

```typescript
import { FormatterRegistry } from './formatters';
import { CustomFormatter } from './CustomFormatter';

FormatterRegistry.registerFormatter(new CustomFormatter());
```

## Error Handling

The system includes robust error handling:

1. **Invalid Timestamps:** Skipped with warnings
2. **Missing Formatters:** Falls back to plain text
3. **Parsing Errors:** Returns raw text with error logged
4. **Invalid Formats:** Defaults to 'txt' format

## Testing

Example test data is provided in `examples/`:

- `sample-input.txt`: Raw transcript input
- `output-json.json`: JSON formatted output
- `output-srt.srt`: SRT formatted output
- `output-vtt.vtt`: VTT formatted output
- `output-txt.txt`: Plain text output

## Performance Considerations

- Formatters use streaming where possible
- Text wrapping uses word boundary detection
- Metadata calculation is lazy (only when needed)
- Registry uses Map for O(1) lookups

## Future Enhancements

Potential additions:
- ASS/SSA subtitle format
- TTML (Timed Text Markup Language)
- CSV export
- Custom format templates
- Async formatting for large files
- Streaming formatters
