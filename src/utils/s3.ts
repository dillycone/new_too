import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromIni } from '@aws-sdk/credential-providers';
import { createWriteStream, unlinkSync, promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { randomBytes } from 'crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { S3Location } from './s3Url.js';
import { parseS3Url as parseS3UrlLite } from './s3Url.js';

export { parseS3Url, isS3Url } from './s3Url.js';

/**
 * Download file from S3 to a temporary location
 * @param s3Url - S3 URL (s3:// or https://)
 * @param profile - Optional AWS profile name; when omitted the default credential chain is used
 * @returns Path to downloaded temporary file
 */
export async function downloadFromS3(s3Url: string, profile?: string): Promise<string> {
  const location = parseS3UrlLite(s3Url);
  if (!location) {
    throw new Error(`Invalid S3 URL: ${s3Url}`);
  }

  const s3Client = createS3Client(location, profile);

  const command = new GetObjectCommand({
    Bucket: location.bucket,
    Key: location.key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('No data received from S3');
  }

  // Save to temporary file
  const keyName = location.key ? basename(location.key) : 'file';
  const tempFileName = `s3-download-${randomBytes(8).toString('hex')}-${keyName}`;
  const tempFilePath = join(tmpdir(), tempFileName);

  const bodyStream = response.Body as unknown;
  if (isNodeReadableStream(bodyStream)) {
    const writeStream = createWriteStream(tempFilePath);
    await pipeline(bodyStream, writeStream);
  } else if (hasTransformToByteArray(bodyStream)) {
    const byteArray = await bodyStream.transformToByteArray();
    await fsPromises.writeFile(tempFilePath, Buffer.from(byteArray));
  } else if (hasArrayBuffer(bodyStream)) {
    const arrayBuffer = await bodyStream.arrayBuffer();
    await fsPromises.writeFile(tempFilePath, Buffer.from(arrayBuffer));
  } else if (typeof bodyStream === 'string') {
    await fsPromises.writeFile(tempFilePath, Buffer.from(bodyStream));
  } else if (bodyStream instanceof Uint8Array || Buffer.isBuffer(bodyStream)) {
    await fsPromises.writeFile(tempFilePath, Buffer.from(bodyStream));
  } else {
    throw new Error('Unsupported S3 response body type for download');
  }

  return tempFilePath;
}

/**
 * Generate a pre-signed URL for an S3 object
 * @param s3Url - S3 URL (s3:// or https://)
 * @param expiresIn - Expiration time in seconds (default: 3600)
 * @param profile - Optional AWS profile name; when omitted the default credential chain is used
  * @returns Pre-signed URL
 */
export async function generatePresignedUrl(
  s3Url: string,
  expiresIn: number = 3600,
  profile?: string
): Promise<string> {
  const location = parseS3UrlLite(s3Url);
  if (!location) {
    throw new Error(`Invalid S3 URL: ${s3Url}`);
  }

  const s3Client = createS3Client(location, profile);

  const command = new GetObjectCommand({
    Bucket: location.bucket,
    Key: location.key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Clean up temporary file
 */
export function cleanupTempFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Suppress cleanup errors to avoid noisy logs during TUI rendering
    // If needed, gate debug reporting behind an env flag in the future.
  }
}

function createS3Client(location: S3Location, profile?: string): S3Client {
  const region = location.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const baseConfig = {
    region,
  };

  if (profile) {
    return new S3Client({
      ...baseConfig,
      credentials: fromIni({ profile }),
    });
  }

  return new S3Client(baseConfig);
}

function isNodeReadableStream(stream: unknown): stream is NodeJS.ReadableStream {
  if (stream instanceof Readable) {
    return true;
  }

  return typeof stream === 'object' && stream !== null && typeof (stream as NodeJS.ReadableStream).pipe === 'function';
}

function hasTransformToByteArray(
  stream: unknown
): stream is { transformToByteArray: () => Promise<Uint8Array> } {
  return typeof (stream as { transformToByteArray?: unknown })?.transformToByteArray === 'function';
}

function hasArrayBuffer(stream: unknown): stream is { arrayBuffer: () => Promise<ArrayBuffer> } {
  return typeof (stream as { arrayBuffer?: unknown })?.arrayBuffer === 'function';
}
