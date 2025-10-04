const VALID_ENCODINGS = ['utf8', 'utf-8', 'ascii', 'binary', 'base64', 'hex', 'latin1', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le'];

function isValidEncoding(encoding: string): encoding is BufferEncoding {
  return VALID_ENCODINGS.includes(encoding.toLowerCase());
}

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
  const stream = process.stderr as NodeJS.WriteStream;
  const originalWrite = stream.write.bind(stream) as NodeJS.WriteStream['write'];
  const mirrorWhenNotTTY = options?.mirrorWhenNotTTY ?? true;
  const forceMirrorTTY = /^(1|true|yes)$/i.test(String(process.env.WIZARD_STDERR_MIRROR_TTY || ''));

  const patched: NodeJS.WriteStream['write'] = function (chunk: any, encoding?: any, cb?: any): boolean {
    try {
      let text: string;

      if (typeof chunk === 'string') {
        text = chunk;
      } else if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
        const enc: BufferEncoding = typeof encoding === 'string' && isValidEncoding(encoding) ? encoding as BufferEncoding : 'utf8';
        text = Buffer.from(chunk).toString(enc);
      } else {
        text = String(chunk ?? '');
      }

      if (!options?.filter || options.filter(text)) {
        try {
          listener(text);
        } catch {
          // Swallow listener errors
        }
      }
    } catch {
      // Swallow parse/capture errors
    }

    let wrote = true;

    if ((mirrorWhenNotTTY && !stream.isTTY) || forceMirrorTTY) {
      // Mirror to original when the patched stream is not a TTY for visibility (e.g., CI/tests)
      wrote = originalWrite(chunk as any, encoding as any, cb as any);
    } else {
      // Avoid hanging callers expecting a callback
      if (typeof cb === 'function') {
        process.nextTick(cb);
      }
    }

    return wrote;
  };

  (stream as any).write = patched;

  return () => {
    (stream as any).write = originalWrite;
  };
}
