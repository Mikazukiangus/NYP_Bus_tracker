export interface JsonBodyLimits { maxBytes?: number; maxDepth?: number; signal?: AbortSignal }
export class InvalidJsonBodyError extends Error {
  constructor() { super('Invalid external data.'); this.name = 'InvalidJsonBodyError'; }
}

// Count decoded stream bytes, including chunked/compressed bodies; Content-Length is only an early check.
export async function readBoundedJson(response: Response, limits: JsonBodyLimits = {}): Promise<unknown> {
  const maxBytes = limits.maxBytes ?? 8 * 1024 * 1024;
  const maxDepth = limits.maxDepth ?? 64;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024 * 1024 ||
      !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 128) throw new InvalidJsonBodyError();
  const signal = limits.signal;
  signal?.throwIfAborted();
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new InvalidJsonBodyError();
  }
  if (!response.body) throw new InvalidJsonBodyError();
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new InvalidJsonBodyError();
      chunks.push(value);
    }
  } catch (error) {
    abort();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let depth = 0, quoted = false, escaped = false;
    for (const char of text) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') { if (++depth > maxDepth) throw new InvalidJsonBodyError(); }
      else if (char === '}' || char === ']') depth--;
    }
    signal?.throwIfAborted();
    return JSON.parse(text);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof InvalidJsonBodyError) throw error;
    throw new InvalidJsonBodyError();
  }
}
