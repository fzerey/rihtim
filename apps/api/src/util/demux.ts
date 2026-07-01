/**
 * Docker multiplexed stream frame:
 *   [STREAM_TYPE, 0, 0, 0, SIZE_1, SIZE_2, SIZE_3, SIZE_4, PAYLOAD...]
 * Some transports emit already-demuxed strings; handle both.
 */
export function demuxDockerLog(chunk: Buffer | string): string {
  if (typeof chunk === "string") return chunk;
  if (chunk.length < 8) return chunk.toString("utf-8");
  const header = chunk[0];
  if (header !== 0 && header !== 1 && header !== 2) return chunk.toString("utf-8");
  const parts: string[] = [];
  let offset = 0;
  while (offset + 8 <= chunk.length) {
    const size = chunk.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > chunk.length) break;
    parts.push(chunk.subarray(start, end).toString("utf-8"));
    offset = end;
  }
  return parts.length ? parts.join("") : chunk.toString("utf-8");
}
