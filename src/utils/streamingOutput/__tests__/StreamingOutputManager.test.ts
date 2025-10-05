/**
 * Tests for StreamingOutputManager
 */

import { describe, it, expect } from 'vitest';
import { StreamingOutputManager } from '../StreamingOutputManager.js';
import { existsSync, readFileSync } from 'node:fs';

describe('StreamingOutputManager', () => {
  it('keeps small outputs in memory', async () => {
    const mgr = new StreamingOutputManager({ memoryThreshold: 1024 }); // 1KB

    const text = 'hello world';
    mgr.write(text);

    expect(mgr.getMode()).toBe('memory');
    const result = await mgr.finalize();
    expect(result).toBe(text);
    mgr.dispose();
  });

  it('switches to streaming mode when threshold exceeded', async () => {
    const mgr = new StreamingOutputManager({ memoryThreshold: 32 }); // tiny threshold

    const chunk1 = 'a'.repeat(20);
    const chunk2 = 'b'.repeat(20);

    mgr.write(chunk1);
    expect(mgr.getMode()).toBe('memory');

    mgr.write(chunk2); // should cross threshold
    expect(mgr.getMode()).toBe('streaming');

    const tempPath = mgr.getTempFilePath();
    expect(tempPath).toBeTruthy();

    const result = await mgr.finalize();
    expect(result).toBe(chunk1 + chunk2);

    mgr.dispose();
  });

  it('finalizes from temp file content correctly', async () => {
    const mgr = new StreamingOutputManager({ memoryThreshold: 10 });
    const content = 'streamed-content-12345';
    mgr.write(content);
    expect(mgr.getMode()).toBe('streaming');

    const path = mgr.getTempFilePath();
    expect(path).toBeTruthy();

    const finalized = await mgr.finalize();
    expect(finalized).toBe(content);
    mgr.dispose();
  });
});
