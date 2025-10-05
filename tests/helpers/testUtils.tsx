/**
 * Test utilities for Ink components
 * Provides helpers for testing React components with Ink
 */

import React from 'react';
import { render as inkRender } from 'ink-testing-library';
import { vi } from 'vitest';

/**
 * Renders an Ink component for testing
 */
export function renderInk(component: React.ReactElement) {
  return inkRender(component);
}

/**
 * Waits for output to contain specific text
 */
export async function waitForText(
  lastFrame: () => string,
  text: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (lastFrame().includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for text "${text}". Last frame: ${lastFrame()}`);
}

/**
 * Waits for output to match a pattern
 */
export async function waitForPattern(
  lastFrame: () => string,
  pattern: RegExp,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (pattern.test(lastFrame())) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for pattern ${pattern}. Last frame: ${lastFrame()}`);
}

/**
 * Simulates user input in Ink components
 */
export function simulateInput(stdin: any, input: string) {
  stdin.write(input);
}

/**
 * Simulates Enter key press
 */
export function pressEnter(stdin: any) {
  stdin.write('\r');
}

/**
 * Simulates arrow key navigation
 */
export function pressArrow(stdin: any, direction: 'up' | 'down' | 'left' | 'right') {
  const codes = {
    up: '\u001B[A',
    down: '\u001B[B',
    right: '\u001B[C',
    left: '\u001B[D',
  };
  stdin.write(codes[direction]);
}

/**
 * Simulates Ctrl+C to exit
 */
export function pressCtrlC(stdin: any) {
  stdin.write('\u0003');
}

/**
 * Creates a mock stdin for testing
 */
export function createMockStdin() {
  const listeners = new Map<string, Set<Function>>();

  return {
    isTTY: true,
    setRawMode: vi.fn(),
    write: vi.fn((data: string) => {
      const dataListeners = listeners.get('data');
      if (dataListeners) {
        dataListeners.forEach((listener) => listener(data));
      }
    }),
    on: vi.fn((event: string, listener: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(listener);
    }),
    removeListener: vi.fn((event: string, listener: Function) => {
      listeners.get(event)?.delete(listener);
    }),
    pause: vi.fn(),
    resume: vi.fn(),
  };
}

/**
 * Creates a mock stdout for testing
 */
export function createMockStdout() {
  let output = '';

  return {
    write: vi.fn((data: string) => {
      output += data;
      return true;
    }),
    getOutput: () => output,
    clear: () => {
      output = '';
    },
    columns: 80,
    rows: 24,
  };
}

/**
 * Delays execution for testing async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a mock abort controller for testing cancellation
 */
export function createMockAbortController() {
  const controller = new AbortController();
  const originalAbort = controller.abort.bind(controller);

  const mockAbort = vi.fn(() => {
    originalAbort();
  });

  controller.abort = mockAbort;

  return {
    controller,
    mockAbort,
  };
}

/**
 * Captures console output during a test
 */
export function captureConsole() {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = vi.fn((...args: any[]) => {
    logs.push(args.join(' '));
  });

  console.warn = vi.fn((...args: any[]) => {
    warns.push(args.join(' '));
  });

  console.error = vi.fn((...args: any[]) => {
    errors.push(args.join(' '));
  });

  return {
    logs,
    warns,
    errors,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}
