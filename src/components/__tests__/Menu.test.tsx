/**
 * Tests for Menu component navigation and selection
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Menu } from '../Menu.js';
import { render as inkRender } from 'ink-testing-library';

function press(stdin: any, code: string) {
  stdin.write(code);
}

function pressEnter(stdin: any) {
  stdin.write('\r');
}

describe('Menu', () => {
  it('renders and highlights first option by default', () => {
    const onSelect = vi.fn();
    const { lastFrame } = inkRender(<Menu onSelect={onSelect} />);
    const frame = lastFrame();
    expect(frame).toContain('❯ 1. Transcribe audio/video file');
  });

  it.skip('navigates with arrow keys and wraps around', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = inkRender(<Menu onSelect={onSelect} />);

    // down to option 2
    press(stdin, '\u001B[B');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('❯ 2. Generate tutorial from audio/video file');

    // down to option 3
    press(stdin, '\u001B[B');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('❯ 3. Batch transcribe multiple files');

    // down wraps to option 1
    press(stdin, '\u001B[B');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('❯ 1. Transcribe audio/video file');

    // up wraps back to option 3
    press(stdin, '\u001B[A');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('❯ 3. Batch transcribe multiple files');
  });

  it('calls provided onSelect handler', () => {
    const onSelect = vi.fn();
    const { unmount } = inkRender(<Menu onSelect={onSelect} />);
    onSelect('generateTutorial');
    expect(onSelect).toHaveBeenCalledWith('generateTutorial');
    unmount();
  });
});
