/**
 * Tests for S3 URL parsing utilities
 */

import { describe, it, expect } from 'vitest';
import { parseS3Url, isS3Url } from '../s3Url.js';

describe('parseS3Url', () => {
  describe('s3:// protocol URLs', () => {
    it('should parse basic s3:// URL', () => {
      const result = parseS3Url('s3://my-bucket/path/to/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
      });
    });

    it('should parse s3:// URL with query parameters', () => {
      const result = parseS3Url('s3://my-bucket/path/to/file.txt?version=123');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
      });
    });

    it('should decode URL-encoded keys', () => {
      const result = parseS3Url('s3://my-bucket/path%20with%20spaces/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path with spaces/file.txt',
      });
    });

    it('should handle keys with special characters', () => {
      const result = parseS3Url('s3://my-bucket/path/to/file+name.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file+name.txt',
      });
    });

    it('should return null for invalid s3:// URL', () => {
      expect(parseS3Url('s3://bucket-only')).toBeNull();
      expect(parseS3Url('s3://')).toBeNull();
      expect(parseS3Url('s3://bucket/')).toBeNull();
    });
  });

  describe('Virtual-hosted-style URLs', () => {
    it('should parse basic virtual-hosted URL', () => {
      const result = parseS3Url('https://my-bucket.s3.amazonaws.com/path/to/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
      });
    });

    it('should parse virtual-hosted URL with region', () => {
      const result = parseS3Url('https://my-bucket.s3.us-west-2.amazonaws.com/path/to/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
        region: 'us-west-2',
      });
    });

    it('should parse virtual-hosted URL with dualstack', () => {
      const result = parseS3Url('https://my-bucket.s3.dualstack.us-east-1.amazonaws.com/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'file.txt',
        region: 'us-east-1',
      });
    });

    it('should parse virtual-hosted URL with accelerate', () => {
      const result = parseS3Url('https://my-bucket.s3-accelerate.amazonaws.com/file.txt');

      expect(result).not.toBeNull();
      expect(result?.bucket).toBe('my-bucket');
      expect(result?.key).toBe('file.txt');
    });

    it('should decode URL-encoded paths', () => {
      const result = parseS3Url('https://my-bucket.s3.amazonaws.com/path%20with%20spaces/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path with spaces/file.txt',
      });
    });

    it('should handle query parameters', () => {
      const result = parseS3Url(
        'https://my-bucket.s3.us-east-1.amazonaws.com/file.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256'
      );

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'file.txt',
        region: 'us-east-1',
      });
    });
  });

  describe('Path-style URLs', () => {
    it('should parse basic path-style URL', () => {
      const result = parseS3Url('https://s3.us-east-1.amazonaws.com/my-bucket/path/to/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
        region: 'us-east-1',
      });
    });

    it('should parse path-style URL without region (legacy)', () => {
      const result = parseS3Url('https://s3.amazonaws.com/my-bucket/path/to/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path/to/file.txt',
      });
    });

    it('should decode URL-encoded paths', () => {
      const result = parseS3Url(
        'https://s3.us-west-2.amazonaws.com/my-bucket/path%20with%20spaces/file.txt'
      );

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'path with spaces/file.txt',
        region: 'us-west-2',
      });
    });

    it('should handle deep paths', () => {
      const result = parseS3Url(
        'https://s3.us-east-1.amazonaws.com/my-bucket/very/deep/path/to/file.txt'
      );

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'very/deep/path/to/file.txt',
        region: 'us-east-1',
      });
    });

    it('should return null for bucket-only path-style URL', () => {
      expect(parseS3Url('https://s3.us-east-1.amazonaws.com/bucket-only')).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseS3Url('')).toBeNull();
    });

    it('should return null for non-S3 URL', () => {
      expect(parseS3Url('https://example.com/file.txt')).toBeNull();
      expect(parseS3Url('http://my-bucket.s3.amazonaws.com/file.txt')).not.toBeNull();
    });

    it('should return null for malformed URL', () => {
      expect(parseS3Url('not-a-url')).toBeNull();
      expect(parseS3Url('s3:/invalid')).toBeNull();
    });

    it('should handle buckets with dots', () => {
      const result = parseS3Url('s3://my.bucket.name/file.txt');

      expect(result).toEqual({
        bucket: 'my.bucket.name',
        key: 'file.txt',
      });
    });

    it('should handle buckets with dashes', () => {
      const result = parseS3Url('s3://my-bucket-name/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket-name',
        key: 'file.txt',
      });
    });

    it('should handle leading slashes in path-style URLs', () => {
      const result = parseS3Url('https://s3.amazonaws.com//my-bucket/file.txt');

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'file.txt',
      });
    });
  });

  describe('Real-world signed URLs', () => {
    it('should parse pre-signed URL with query parameters', () => {
      const url =
        'https://my-bucket.s3.us-east-1.amazonaws.com/file.txt?' +
        'X-Amz-Algorithm=AWS4-HMAC-SHA256&' +
        'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE&' +
        'X-Amz-Date=20230101T120000Z&' +
        'X-Amz-Expires=3600&' +
        'X-Amz-SignedHeaders=host&' +
        'X-Amz-Signature=example';

      const result = parseS3Url(url);

      expect(result).toEqual({
        bucket: 'my-bucket',
        key: 'file.txt',
        region: 'us-east-1',
      });
    });
  });
});

describe('isS3Url', () => {
  it('should return true for valid s3:// URLs', () => {
    expect(isS3Url('s3://my-bucket/file.txt')).toBe(true);
  });

  it('should return true for valid virtual-hosted URLs', () => {
    expect(isS3Url('https://my-bucket.s3.amazonaws.com/file.txt')).toBe(true);
    expect(isS3Url('https://my-bucket.s3.us-west-2.amazonaws.com/file.txt')).toBe(true);
  });

  it('should return true for valid path-style URLs', () => {
    expect(isS3Url('https://s3.us-east-1.amazonaws.com/my-bucket/file.txt')).toBe(true);
    expect(isS3Url('https://s3.amazonaws.com/my-bucket/file.txt')).toBe(true);
  });

  it('should return false for non-S3 URLs', () => {
    expect(isS3Url('https://example.com/file.txt')).toBe(false);
    expect(isS3Url('http://google.com')).toBe(false);
    expect(isS3Url('/local/path/to/file.txt')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isS3Url('')).toBe(false);
  });

  it('should return false for malformed URLs', () => {
    expect(isS3Url('not-a-url')).toBe(false);
    expect(isS3Url('s3://bucket-only')).toBe(false);
  });
});
