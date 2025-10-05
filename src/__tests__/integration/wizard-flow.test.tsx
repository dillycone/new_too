/**
 * Minimal wizard navigation tests
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { Wizard } from '../../wizard.js';
import { render as inkRender } from 'ink-testing-library';

function press(stdin: any, code: string) {
  stdin.write(code);
}

function pressEnter(stdin: any) {
  stdin.write('\r');
}

describe('Wizard flow', () => {
  it('renders initial menu screen', () => {
    const { lastFrame } = inkRender(<Wizard />);
    expect(lastFrame()).toContain('Select an option:');
  });
});
