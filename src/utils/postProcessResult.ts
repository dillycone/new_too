import { writeFileSync } from 'node:fs';
import { basename, extname, resolve as resolvePath } from 'node:path';
import { isS3Url } from './s3Url.js';
import type { ProcessingResult } from '../types.js';

export interface PostProcessOptions {
  filePath: string;
  data: string;
  fallbackBaseName: string;
  extension: string;
  artifactLabel: string;
  verbose: boolean;
  enqueueStatus: (message: string) => void;
  appendConsoleMessage: (message: string) => void;
  generatePresignedUrl?: ((filePath: string) => Promise<string>) | undefined;
  shouldAttemptPresign: boolean;
}

export async function finalizeProcessing(
  baseResult: ProcessingResult,
  {
    filePath,
    data,
    fallbackBaseName,
    extension,
    artifactLabel,
    verbose,
    enqueueStatus,
    appendConsoleMessage,
    generatePresignedUrl,
    shouldAttemptPresign,
  }: PostProcessOptions
): Promise<ProcessingResult> {
  let updatedResult: ProcessingResult = { ...baseResult };

  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const baseName = isS3Url(filePath) ? fallbackBaseName : basename(filePath, extname(filePath));
  const outputPath = resolvePath(process.cwd(), `${baseName}${normalizedExtension}`);

  try {
    writeFileSync(outputPath, data, 'utf8');
    updatedResult = { ...updatedResult, artifactPath: outputPath };
    if (verbose) {
      appendConsoleMessage(`Saved ${artifactLabel} → ${outputPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (verbose) {
      appendConsoleMessage(`[ERROR] Failed to save ${artifactLabel}: ${message}`);
    } else {
      enqueueStatus(`Failed to save ${artifactLabel}: ${message}`);
    }
  }

  if (verbose && shouldAttemptPresign && generatePresignedUrl) {
    try {
      const presignedUrl = await generatePresignedUrl(filePath);
      updatedResult = { ...updatedResult, presignedUrl };
      appendConsoleMessage(`[S3] Presigned URL (1h): ${presignedUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendConsoleMessage(`[S3] Failed to generate presigned URL: ${message}`);
    }
  }

  return updatedResult;
}
