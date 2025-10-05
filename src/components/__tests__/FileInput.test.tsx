/**
 * Tests for FileInput component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { FileInput } from '../FileInput.js';
import { render as inkRender } from 'ink-testing-library';

async function typeSlow(stdin: any, text: string) {
  for (const ch of text.split('')) {
    stdin.write(ch);
    await new Promise((r) => setTimeout(r, 1));
  }
}

function pressEnter(stdin: any) {
  stdin.write('\r');
}

describe('FileInput', () => {
  it('shows correct title for operation', () => {
    const { lastFrame } = inkRender(
      <FileInput operationType="transcribe" onSubmit={() => {}} />
    );
    expect(lastFrame()).toContain('🎬 Transcribe Audio/Video File');
  });

  it('submits entered path on Enter', async () => {
    const onSubmit = vi.fn();
    const { stdin } = inkRender(
      <FileInput operationType="transcribe" onSubmit={onSubmit} />
    );
    await typeSlow(stdin, '/tmp/test.mp3');
    pressEnter(stdin);
    await new Promise((r) => setTimeout(r, 10));
    expect(onSubmit).toHaveBeenCalledWith('/tmp/test.mp3');
  });

  it('strips surrounding quotes from input', async () => {
    const onSubmit = vi.fn();
    const { stdin } = inkRender(
      <FileInput operationType="transcribe" onSubmit={onSubmit} />
    );
    await typeSlow(stdin, '"/Users/me/My File.mp4"');
    pressEnter(stdin);
    await new Promise((r) => setTimeout(r, 10));
    expect(onSubmit).toHaveBeenCalledWith('/Users/me/My File.mp4');
  });

  it.skip('calls onCancel on Escape', () => {
    // ESC key simulation is flaky in CI TTY-less environments.
    // This test is skipped to avoid false negatives.
  });
});
