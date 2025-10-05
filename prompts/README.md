# Prompts Directory

This directory contains prompt templates used by the media processing commands.

## Available Prompts

### `tutorial-generation.txt`
Used by the `generateTutorial` command to create comprehensive tutorials from video/audio content.

### `transcription.txt`
Used by the `transcribe` command to control the default transcript formatting (timestamps, diarization, etc.).

**Features:**
- Overview and learning objectives
- Timestamped key topics
- Step-by-step explanations
- Important takeaways
- Practice exercises

**Usage:** Automatically loaded by `src/commands/generateTutorial.ts`

## Customizing Prompts

You can modify these prompt files to change the output format and content structure. The prompts are loaded at runtime, so changes take effect immediately without rebuilding.

### Tips for Effective Prompts

1. **Be specific** about the structure you want
2. **Request timestamps** if temporal information is important
3. **Include examples** of the desired format if needed
4. **Specify tone and style** (educational, conversational, technical, etc.)
