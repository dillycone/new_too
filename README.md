# Media Processing Wizard

A beautiful CLI wizard built with Ink for transcribing audio/video files and generating tutorials.

## Features

- 🎬 Interactive menu with arrow key navigation
- 📁 File input with drag-and-drop support
- ⚡ Two processing modes:
  - Transcribe audio/video files
  - Generate tutorials from audio/video files
- 💅 Clean, boxed UI inspired by Claude Code

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
│   │   └── generateTutorial.ts # Tutorial generation stub
│   ├── types.ts               # TypeScript interfaces
│   ├── wizard.tsx             # Main wizard orchestrator
│   └── index.tsx              # CLI entry point
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Menu Screen**: Navigate with ↑↓ arrows, select with Enter
2. **File Input Screen**: Enter file path or drag-and-drop a file
3. **Processing**: Shows live status; transcript stream appears for Transcribe
4. **Complete**: Shows success message and exits

## Stub Implementation

`generateTutorial` is currently a simulated workflow. `transcribe` is implemented using Google Gemini Files API and supports S3 URLs.

Environment variables:

- `GEMINI_API_KEY` (required for `transcribe`)
- Optional AWS variables (for S3): `AWS_REGION`, `AWS_PROFILE`, etc.

Node.js: requires Node >= 18.17 (top‑level await, ESM).

## Development

```bash
npm run dev   # Run in development mode
npm run build # Compile TypeScript
```

## Technologies

- **Ink** - React for CLIs
- **TypeScript** - Type safety
- **React** - Component-based UI
