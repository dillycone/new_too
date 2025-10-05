/**
 * Mock S3 client for testing using aws-sdk-client-mock
 * Provides utilities for mocking S3 operations
 */

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { vi } from 'vitest';

export interface MockS3File {
  bucket: string;
  key: string;
  body: string | Buffer;
  contentType?: string;
  etag?: string;
  metadata?: Record<string, string>;
}

/**
 * Creates a mock S3 client with predefined files
 */
export function createMockS3Client(files: MockS3File[] = []) {
  const s3Mock = mockClient(S3Client);

  // Store files in a map for easy lookup
  const fileMap = new Map<string, MockS3File>();
  files.forEach((file) => {
    const key = `${file.bucket}/${file.key}`;
    fileMap.set(key, file);
  });

  // Mock GetObjectCommand
  s3Mock.on(GetObjectCommand).callsFake((arg: any) => {
    const input = (arg && (arg.Bucket || arg.Key)) ? arg : (arg?.input ?? {});
    const key = `${input.Bucket}/${input.Key}`;
    const file = fileMap.get(key);

    if (!file) {
      const error = new Error('NoSuchKey');
      (error as any).name = 'NoSuchKey';
      (error as any).statusCode = 404;
      throw error;
    }

    // Convert body to readable stream
    const body = typeof file.body === 'string'
      ? Buffer.from(file.body)
      : file.body;

    const stream = Readable.from(body);

    return {
      Body: stream,
      ContentType: file.contentType || 'application/octet-stream',
      ETag: file.etag || `"${Date.now()}"`,
      Metadata: file.metadata || {},
    };
  });

  // Mock HeadObjectCommand
  s3Mock.on(HeadObjectCommand).callsFake((arg: any) => {
    const input = (arg && (arg.Bucket || arg.Key)) ? arg : (arg?.input ?? {});
    const key = `${input.Bucket}/${input.Key}`;
    const file = fileMap.get(key);

    if (!file) {
      const error = new Error('NoSuchKey');
      (error as any).name = 'NoSuchKey';
      (error as any).statusCode = 404;
      throw error;
    }

    const bodySize = typeof file.body === 'string'
      ? Buffer.byteLength(file.body)
      : file.body.length;

    return {
      ContentType: file.contentType || 'application/octet-stream',
      ContentLength: bodySize,
      ETag: file.etag || `"${Date.now()}"`,
      Metadata: file.metadata || {},
    };
  });

  return {
    mock: s3Mock,
    addFile: (file: MockS3File) => {
      const key = `${file.bucket}/${file.key}`;
      fileMap.set(key, file);
    },
    removeFile: (bucket: string, key: string) => {
      const fileKey = `${bucket}/${key}`;
      fileMap.delete(fileKey);
    },
    getFile: (bucket: string, key: string) => {
      const fileKey = `${bucket}/${key}`;
      return fileMap.get(fileKey);
    },
    reset: () => {
      s3Mock.reset();
      fileMap.clear();
    },
  };
}

/**
 * Creates a mock that simulates S3 errors
 */
export function createFailingS3Client(errorType: 'NoSuchKey' | 'AccessDenied' | 'Network' = 'NoSuchKey') {
  const s3Mock = mockClient(S3Client);

  const createError = () => {
    switch (errorType) {
      case 'NoSuchKey': {
        const error = new Error('The specified key does not exist.');
        (error as any).name = 'NoSuchKey';
        (error as any).statusCode = 404;
        return error;
      }
      case 'AccessDenied': {
        const error = new Error('Access Denied');
        (error as any).name = 'AccessDenied';
        (error as any).statusCode = 403;
        return error;
      }
      case 'Network': {
        const error = new Error('Network error');
        (error as any).code = 'ECONNREFUSED';
        return error;
      }
    }
  };

  s3Mock.on(GetObjectCommand).rejects(createError());
  s3Mock.on(HeadObjectCommand).rejects(createError());

  return {
    mock: s3Mock,
    reset: () => s3Mock.reset(),
  };
}

/**
 * Creates a mock with rate limiting simulation
 */
export function createRateLimitedS3Client(failuresBeforeSuccess = 2) {
  const s3Mock = mockClient(S3Client);
  let attemptCount = 0;

  s3Mock.on(GetObjectCommand).callsFake(() => {
    attemptCount++;

    if (attemptCount <= failuresBeforeSuccess) {
      const error = new Error('SlowDown');
      (error as any).name = 'SlowDown';
      (error as any).statusCode = 503;
      (error as any).headers = { 'retry-after': '1' };
      throw error;
    }

    return {
      Body: Readable.from(Buffer.from('Success after retries')),
      ContentType: 'text/plain',
      ETag: '"success-etag"',
    };
  });

  return {
    mock: s3Mock,
    getAttemptCount: () => attemptCount,
    reset: () => {
      s3Mock.reset();
      attemptCount = 0;
    },
  };
}

/**
 * Utility to create a mock file with specific content
 */
export function createMockFile(
  bucket: string,
  key: string,
  content: string,
  options: Partial<MockS3File> = {}
): MockS3File {
  return {
    bucket,
    key,
    body: content,
    contentType: 'text/plain',
    etag: `"${Math.random().toString(36).substring(7)}"`,
    ...options,
  };
}
