import { getConfig } from '../config/index.js';

const VALID_ENCODINGS = ['utf8', 'utf-8', 'ascii', 'binary', 'base64', 'hex', 'latin1', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le'];

function isValidEncoding(encoding: string): encoding is BufferEncoding {
  return VALID_ENCODINGS.includes(encoding.toLowerCase());
}

/**
 * Type guard to check if a value is a callback function.
 */
function isCallback(value: unknown): value is WriteCallback {
  return typeof value === 'function';
}

/**
 * Valid chunk types that can be written to a stream.
 */
type WriteChunk = string | Uint8Array | Buffer;

/**
 * Callback function signature for write operations.
 */
type WriteCallback = (error?: Error | null) => void;

/**
 * Union type for the second parameter which can be either encoding or callback.
 */
type EncodingOrCallback = BufferEncoding | WriteCallback;

/**
 * Utility type to make specific properties writable (removes readonly modifier).
 */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

export type StderrListener = (data: string) => void;

export type StderrOptions = {
  /**
   * When true, mirrors stderr writes to the original stream when the patched stream is not a TTY
   * (useful in tests/CI). Defaults to true.
   */
  mirrorWhenNotTTY?: boolean;
  /**
   * Optional per-chunk filter. If provided and returns false, the chunk is not forwarded to the listener.
   */
  filter?: (chunk: string) => boolean;
};

/**
 * Start capturing process.stderr writes.
 * - Converts Buffer/Uint8Array chunks to string (default utf8)
 * - Applies optional filter
 * - Mirrors to original stderr when not a TTY (default true)
 * - Returns a cleanup function that restores the original write
 * - Swallows listener errors to avoid breaking the capture
 */
export function startStderrCapture(listener: StderrListener, options?: StderrOptions): () => void {
  const config = getConfig();
  const stream = process.stderr as NodeJS.WriteStream;
  const originalWrite = stream.write.bind(stream) as NodeJS.WriteStream['write'];
  const mirrorWhenNotTTY = options?.mirrorWhenNotTTY ?? true;
  const forceMirrorTTY = config.app.wizardStderrMirrorTty;

  /**
   * Patched write function with proper type-safe overloads matching Node.js WriteStream.
   * Handles three signature variations:
   * 1. write(chunk, callback)
   * 2. write(chunk, encoding, callback)
   * 3. write(chunk)
   */
  const patched: NodeJS.WriteStream['write'] = function (
    chunk: WriteChunk,
    encodingOrCallback?: EncodingOrCallback,
    callback?: WriteCallback
  ): boolean {
    try {
      let text: string;

      // Determine actual encoding and callback from parameters
      let actualEncoding: BufferEncoding | undefined;
      let actualCallback: WriteCallback | undefined;

      if (isCallback(encodingOrCallback)) {
        // Signature: write(chunk, callback)
        actualCallback = encodingOrCallback;
      } else if (typeof encodingOrCallback === 'string') {
        // Signature: write(chunk, encoding, callback?)
        actualEncoding = encodingOrCallback;
        actualCallback = callback;
      } else {
        // Signature: write(chunk) - no encoding or callback
        actualCallback = callback;
      }

      // Convert chunk to string
      if (typeof chunk === 'string') {
        text = chunk;
      } else if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
        const enc: BufferEncoding = actualEncoding && isValidEncoding(actualEncoding) ? actualEncoding : 'utf8';
        text = Buffer.from(chunk).toString(enc);
      } else {
        text = String(chunk ?? '');
      }

      // Apply filter and call listener
      if (!options?.filter || options.filter(text)) {
        try {
          listener(text);
        } catch {
          // Swallow listener errors to avoid breaking the capture
        }
      }
    } catch {
      // Swallow parse/capture errors to avoid breaking the stream
    }

    let wrote = true;

    if ((mirrorWhenNotTTY && !stream.isTTY) || forceMirrorTTY) {
      // Mirror to original when the patched stream is not a TTY for visibility (e.g., CI/tests)
      // Type assertion needed here because we're forwarding the parameters as-is to the original write
      wrote = originalWrite(chunk, encodingOrCallback as any, callback as any);
    } else {
      // Avoid hanging callers expecting a callback
      // Determine which parameter is the callback
      const cb = isCallback(encodingOrCallback) ? encodingOrCallback : callback;
      if (cb) {
        process.nextTick(cb);
      }
    }

    return wrote;
  };

  /**
   * Override the readonly 'write' property on the stream.
   * Type assertion is necessary because TypeScript marks 'write' as readonly,
   * but we need to replace it for capturing stderr. This is the intended use case
   * for monkey-patching streams in Node.js.
   */
  (stream as Writable<NodeJS.WriteStream>).write = patched;

  return () => {
    /**
     * Restore the original write function.
     * Type assertion necessary for the same reason as above - overriding readonly property.
     */
    (stream as Writable<NodeJS.WriteStream>).write = originalWrite;
  };
}
