import { writeFileSync } from 'node:fs';
import { basename, extname, resolve as resolvePath } from 'node:path';
import { isS3Url } from './s3Url.js';
import type { ProcessingResult } from '../types.js';
import type { OutputFormat } from '../formatters/types.js';
import { FormatterRegistry, parseRawTranscript } from '../formatters/index.js';
import type { StreamingOutputController } from './streamingOutput/index.js';

export interface PostProcessOptions {
  filePath: string;
  data?: string;
  fallbackBaseName: string;
  extension: string;
  artifactLabel: string;
  verbose: boolean;
  enqueueStatus: (message: string) => void;
  appendConsoleMessage: (message: string) => void;
  generatePresignedUrl?: ((filePath: string) => Promise<string>) | undefined;
  shouldAttemptPresign: boolean;
  outputFormat?: OutputFormat;
  formatSource?: string;
  streamingManager?: StreamingOutputController;
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
    outputFormat,
    formatSource,
    streamingManager,
  }: PostProcessOptions
): Promise<ProcessingResult> {
  let updatedResult: ProcessingResult = { ...baseResult };

  // Get the data from streaming manager if provided, otherwise use direct data
  let rawData: string;
  if (streamingManager) {
    try {
      rawData = await streamingManager.finalize();
      const progress = streamingManager.getProgress();

      if (verbose && progress.mode === 'streaming') {
        appendConsoleMessage(
          `[Memory] Finalized streaming output: ${formatBytes(progress.bytesWritten)} (${progress.chunksProcessed} chunks)`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to finalize streaming output: ${message}`);
    }
  } else if (data !== undefined) {
    rawData = data;
  } else {
    throw new Error('Either data or streamingManager must be provided');
  }

  // Determine the output format and apply formatting if needed
  let formattedData = rawData;
  let finalExtension = extension;
  let actualFormat = outputFormat;

  if (outputFormat && outputFormat !== 'txt') {
    try {
      // Parse the raw transcript
      const parsed = parseRawTranscript(rawData);

      // Add source metadata if available
      if (formatSource) {
        parsed.metadata = {
          ...parsed.metadata,
          source: formatSource,
        };
      }

      // Get the appropriate formatter
      const formatter = FormatterRegistry.getFormatter(outputFormat);

      if (formatter) {
        formattedData = formatter.format(parsed);
        finalExtension = `.${formatter.extension}`;
        actualFormat = formatter.formatType;

        if (verbose) {
          appendConsoleMessage(`[FORMAT] Applied ${outputFormat.toUpperCase()} formatting`);
        }
      } else {
        if (verbose) {
          appendConsoleMessage(`[FORMAT] Formatter not found for '${outputFormat}', using raw text`);
        }
        actualFormat = 'txt';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (verbose) {
        appendConsoleMessage(`[FORMAT] Formatting failed: ${message}, using raw text`);
      }
      actualFormat = 'txt';
      formattedData = rawData;
    }
  } else {
    actualFormat = 'txt';
  }

  const normalizedExtension = finalExtension.startsWith('.') ? finalExtension : `.${finalExtension}`;
  const baseName = isS3Url(filePath) ? fallbackBaseName : basename(filePath, extname(filePath));
  const outputPath = resolvePath(process.cwd(), `${baseName}${normalizedExtension}`);

  try {
    writeFileSync(outputPath, formattedData, 'utf8');
    updatedResult = {
      ...updatedResult,
      artifactPath: outputPath,
      outputFormat: actualFormat,
    };
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

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
