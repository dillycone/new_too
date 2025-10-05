/**
 * Mock filesystem operations for testing
 * Provides in-memory filesystem simulation
 */

import { vi } from 'vitest';
import type { Stats } from 'fs';

export interface MockFileSystemEntry {
  type: 'file' | 'directory';
  content?: string | Buffer;
  mode?: number;
  mtime?: Date;
  size?: number;
}

/**
 * Creates an in-memory filesystem mock
 */
export function createMockFileSystem() {
  const files = new Map<string, MockFileSystemEntry>();

  return {
    // Add a file to the mock filesystem
    addFile: (path: string, content: string | Buffer, options: Partial<MockFileSystemEntry> = {}) => {
      files.set(path, {
        type: 'file',
        content,
        mode: options.mode || 0o644,
        mtime: options.mtime || new Date(),
        size: options.size || (typeof content === 'string' ? content.length : content.length),
        ...options,
      });
    },

    // Add a directory to the mock filesystem
    addDirectory: (path: string, options: Partial<MockFileSystemEntry> = {}) => {
      files.set(path, {
        type: 'directory',
        mode: options.mode || 0o755,
        mtime: options.mtime || new Date(),
        ...options,
      });
    },

    // Remove a file or directory
    remove: (path: string) => {
      files.delete(path);
    },

    // Check if path exists
    exists: (path: string) => {
      return files.has(path);
    },

    // Get file content
    getContent: (path: string): string | Buffer | undefined => {
      const entry = files.get(path);
      return entry?.type === 'file' ? entry.content : undefined;
    },

    // Get all files
    getFiles: () => {
      return Array.from(files.entries())
        .filter(([_, entry]) => entry.type === 'file')
        .map(([path]) => path);
    },

    // Clear all files
    clear: () => {
      files.clear();
    },

    // Create mock fs.promises API
    createFsPromises: () => ({
      readFile: vi.fn(async (path: string, encoding?: string) => {
        const entry = files.get(path);
        if (!entry || entry.type !== 'file') {
          const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
        if (encoding === 'utf8' && typeof entry.content === 'string') {
          return entry.content;
        }
        return entry.content;
      }),

      writeFile: vi.fn(async (path: string, content: string | Buffer) => {
        files.set(path, {
          type: 'file',
          content,
          mode: 0o644,
          mtime: new Date(),
          size: typeof content === 'string' ? content.length : content.length,
        });
      }),

      unlink: vi.fn(async (path: string) => {
        if (!files.has(path)) {
          const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
        files.delete(path);
      }),

      copyFile: vi.fn(async (src: string, dest: string) => {
        const entry = files.get(src);
        if (!entry || entry.type !== 'file') {
          const error = new Error(`ENOENT: no such file or directory, copyfile '${src}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
        files.set(dest, { ...entry });
      }),

      mkdir: vi.fn(async (path: string) => {
        files.set(path, {
          type: 'directory',
          mode: 0o755,
          mtime: new Date(),
        });
      }),

      stat: vi.fn(async (path: string): Promise<Stats> => {
        const entry = files.get(path);
        if (!entry) {
          const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }

        return {
          isFile: () => entry.type === 'file',
          isDirectory: () => entry.type === 'directory',
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          dev: 0,
          ino: 0,
          mode: entry.mode || 0,
          nlink: 1,
          uid: 0,
          gid: 0,
          rdev: 0,
          size: entry.size || 0,
          blksize: 4096,
          blocks: 0,
          atimeMs: entry.mtime?.getTime() || Date.now(),
          mtimeMs: entry.mtime?.getTime() || Date.now(),
          ctimeMs: entry.mtime?.getTime() || Date.now(),
          birthtimeMs: entry.mtime?.getTime() || Date.now(),
          atime: entry.mtime || new Date(),
          mtime: entry.mtime || new Date(),
          ctime: entry.mtime || new Date(),
          birthtime: entry.mtime || new Date(),
        } as Stats;
      }),

      access: vi.fn(async (path: string) => {
        if (!files.has(path)) {
          const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
      }),
    }),

    // Create mock fs API (sync versions)
    createFs: () => ({
      existsSync: vi.fn((path: string) => files.has(path)),

      readFileSync: vi.fn((path: string, encoding?: string) => {
        const entry = files.get(path);
        if (!entry || entry.type !== 'file') {
          const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
        if (encoding === 'utf8' && typeof entry.content === 'string') {
          return entry.content;
        }
        return entry.content;
      }),

      writeFileSync: vi.fn((path: string, content: string | Buffer) => {
        files.set(path, {
          type: 'file',
          content,
          mode: 0o644,
          mtime: new Date(),
          size: typeof content === 'string' ? content.length : content.length,
        });
      }),

      unlinkSync: vi.fn((path: string) => {
        if (!files.has(path)) {
          const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
        files.delete(path);
      }),
    }),
  };
}

/**
 * Creates a mock that simulates filesystem errors
 */
export function createFailingFileSystem(errorType: 'ENOENT' | 'EACCES' | 'ENOSPC' = 'ENOENT') {
  const mockFs = createMockFileSystem();
  const fsPromises = mockFs.createFsPromises();

  // Override methods to throw errors
  const createError = (operation: string, path: string) => {
    const error = new Error(`${errorType}: ${operation} '${path}'`);
    (error as any).code = errorType;
    return error;
  };

  return {
    ...mockFs,
    createFsPromises: () => ({
      ...fsPromises,
      readFile: vi.fn(async (path: string) => {
        throw createError('no such file or directory, open', path);
      }),
      writeFile: vi.fn(async (path: string) => {
        if (errorType === 'ENOSPC') {
          throw createError('no space left on device, write', path);
        }
        throw createError('permission denied, open', path);
      }),
    }),
  };
}
