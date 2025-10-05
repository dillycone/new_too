#!/usr/bin/env node

import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { Wizard } from './wizard.js';
import { restoreConsole } from './utils/consoleCapture.js';
import { loadConfig, ConfigValidationError } from './config/index.js';

process.on('exit', restoreConsole);
process.on('SIGINT', () => {
  restoreConsole();
  process.exit(130);
});
process.on('uncaughtException', (error) => {
  restoreConsole();
  throw error;
});

// Load and validate configuration before starting the application
try {
  loadConfig();
} catch (error) {
  restoreConsole();
  if (error instanceof ConfigValidationError) {
    console.error('\n' + error.message + '\n');
    process.exit(1);
  }
  throw error;
}

const app = render(<Wizard />);

await app.waitUntilExit();
