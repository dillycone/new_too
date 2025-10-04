#!/usr/bin/env node

import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { Wizard } from './wizard.js';
import { restoreConsole } from './utils/consoleCapture.js';

process.on('exit', restoreConsole);
process.on('SIGINT', () => {
  restoreConsole();
  process.exit(130);
});
process.on('uncaughtException', (error) => {
  restoreConsole();
  throw error;
});

const app = render(<Wizard />);

await app.waitUntilExit();
