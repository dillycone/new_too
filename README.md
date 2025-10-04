# Media Processing Wizard

A beautiful CLI wizard built with Ink for transcribing audio/video files and generating tutorials.

## Features

- 🎬 Interactive menu with arrow key navigation
- 📁 File input with drag-and-drop support
- ⚡ Two processing modes:
  - **Transcribe**: Extract text transcripts from audio/video files using Google Gemini
  - **Generate Tutorial**: Create comprehensive tutorials from video/audio content using AI
- 💅 Clean, boxed UI inspired by Claude Code
- 🌐 Support for local files and S3 URLs (s3:// or https://s3...)
- 📊 Streaming output with live progress updates
- ⏸️ Cancellable operations (press Esc or Q to abort)

## Installation

```bash
npm install
```

## Usage

Two options:

- Development (TypeScript via ts-node): `npm start`
- Built CLI (after `npm run build`): `npx media-wizard`

## Project Structure

```
new_too/
├── src/
│   ├── components/
│   │   ├── Menu.tsx           # Interactive menu component
│   │   └── FileInput.tsx      # File path input with drag-and-drop tip
│   ├── commands/
│   │   ├── transcribe.ts      # Transcription command (Gemini + S3 support)
│   │   └── generateTutorial.ts # Tutorial generation (Gemini + S3 support)
│   ├── utils/
│   │   ├── gemini.ts          # Shared Gemini AI utilities
│   │   ├── s3.ts              # S3 download and upload helpers
│   │   ├── consoleCapture.ts  # Console output capture
│   │   └── stderrCapture.ts   # Stderr capture for clean UI
│   ├── types.ts               # TypeScript interfaces
│   ├── wizard.tsx             # Main wizard orchestrator
│   └── index.tsx              # CLI entry point
├── prompts/
│   ├── tutorial-generation.txt # Tutorial generation prompt template
│   └── README.md              # Prompt customization guide
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Menu Screen**: Navigate with ↑↓ arrows, select with Enter
2. **File Input Screen**: Enter file path (local or S3 URL) or drag-and-drop a file
3. **Processing**: Shows live status with streaming output
   - **Transcribe mode**: Streams transcript text in real-time
   - **Tutorial mode**: Streams tutorial sections as they're generated
4. **Complete**: Shows success message with output file locations and exits

### Transcription Workflow

When you select "Transcribe an audio/video file":
1. Uploads the media file to Google Gemini Files API (or uses S3 URL directly)
2. Waits for file processing to complete
3. Generates transcript using Gemini's audio/video understanding
4. Saves transcript to `<basename>.transcript.txt`

### Tutorial Generation Workflow

When you select "Generate a tutorial from a video/audio file":
1. Uploads the media file to Google Gemini Files API (or uses S3 URL directly)
2. Waits for file processing to complete
3. Generates comprehensive tutorial using Gemini, including:
   - Overview and learning objectives
   - Structured sections with timestamps
   - Key concepts and examples
   - Practice exercises and summary
4. Saves tutorial to `<basename>.tutorial.md`

## Configuration

### Required Environment Variables

- `GEMINI_API_KEY` - Your Google Gemini API key (required for both transcription and tutorial generation)

### Optional Environment Variables

**AWS S3 Support** (for S3 URLs):
- `AWS_REGION` - AWS region for S3 access
- `AWS_PROFILE` - AWS credentials profile to use
- Other standard AWS SDK environment variables

**Gemini Processing Tuning**:
- `GEMINI_READY_TIMEOUT_MS` - Maximum wait time for file processing (default: 300000ms / 5 minutes)
- `GEMINI_POLL_INTERVAL_MS` - Polling interval for file status checks (default: 2000ms / 2 seconds)

### Output Files

- **Transcription**: `<basename>.transcript.txt` - Plain text transcript
- **Tutorial**: `<basename>.tutorial.md` - Markdown-formatted tutorial

Where `<basename>` is the original filename without extension.

### Customizing Prompts

Tutorial generation uses a customizable prompt template located at `prompts/tutorial-generation.txt`. You can modify this file to change:
- Output structure and format
- Level of detail
- Specific sections to include
- Tone and style

Changes take effect immediately without rebuilding. See `prompts/README.md` for detailed customization tips.

### Requirements

- Node.js >= 18.17 (for top-level await and ESM support)
- Valid Gemini API key
- (Optional) AWS credentials for S3 URL support

## Development

```bash
npm run dev   # Run in development mode
npm run build # Compile TypeScript
```

## Technologies

- **Ink** - React for CLIs
- **TypeScript** - Type safety
- **React** - Component-based UI
