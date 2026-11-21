/**
 * Lean queries return MongoDB's BSON Binary rather than a Node Buffer, and Buffer.from() on a
 * Binary yields nothing, so the bytes are taken from its own buffer.
 */
export function bytesOf(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  const inner = (data as { buffer?: unknown } | null)?.buffer;
  if (inner instanceof Uint8Array) {
    return Buffer.from(inner.buffer, inner.byteOffset, inner.byteLength);
  }
  if (inner instanceof ArrayBuffer) {
    return Buffer.from(inner);
  }
  return Buffer.alloc(0);
}
