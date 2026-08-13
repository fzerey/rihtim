import * as tar from "tar-stream";

export class ArchiveError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ArchiveError";
  }
}

export type GetArchive = (path: string) => Promise<NodeJS.ReadableStream>;
export type PutArchive = (
  tarStream: NodeJS.ReadableStream,
  path: string,
) => Promise<unknown>;

export interface FsEntry {
  name: string;
  isDir: boolean;
  isLink: boolean;
  size: number;
  mode: number;
  mtime: number;
  linkTarget?: string;
}

export interface DirListing {
  path: string;
  isDir: boolean;
  truncated: boolean;
  entries: FsEntry[];
}

export interface FileResult {
  path: string;
  size: number;
  truncated: boolean;
  binary: boolean;
  content: string;
  encoding: "utf-8" | "base64";
}

export function basename(p: string): string {
  let trimmed = p;
  while (trimmed.length > 1 && trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  if (trimmed === "" || trimmed === "/") return "/";
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function dirname(p: string): string {
  let trimmed = p;
  while (trimmed.length > 1 && trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return true;
    if (b < 7 && b !== 0) return true;
  }
  return false;
}

/** List a directory's immediate children via the Docker archive (tar) API. */
export async function listArchiveDir(
  getArchive: GetArchive,
  target: string,
  limit: number,
): Promise<DirListing> {
  let archiveStream: NodeJS.ReadableStream;
  try {
    archiveStream = await getArchive(target);
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    throw new ArchiveError(e.statusCode ?? 404, "path_not_found", e.message ?? String(err));
  }

  const rootBase = target === "/" ? "" : basename(target);
  const entries: FsEntry[] = [];
  let selfIsDir = false;
  let count = 0;

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();
    extract.on("entry", (header, stream, next) => {
      stream.on("end", next);
      stream.on("error", next);

      if (count >= limit) {
        stream.resume();
        return;
      }

      let raw = header.name;
      if (raw.endsWith("/")) raw = raw.slice(0, -1);
      if (raw.startsWith("./")) raw = raw.slice(2);
      if (raw.startsWith("/")) raw = raw.slice(1);

      if (raw === "" || raw === "." || (rootBase !== "" && raw === rootBase)) {
        if (header.type === "directory") selfIsDir = true;
        stream.resume();
        return;
      }

      let rel: string;
      if (rootBase === "") {
        rel = raw;
      } else {
        const prefix = `${rootBase}/`;
        if (!raw.startsWith(prefix)) {
          stream.resume();
          return;
        }
        rel = raw.slice(prefix.length);
      }

      if (!rel || rel.includes("/")) {
        stream.resume();
        return;
      }

      const isDir = header.type === "directory";
      const isLink = header.type === "symlink" || header.type === "link";
      entries.push({
        name: rel,
        isDir,
        isLink,
        size: header.size ?? 0,
        mode: header.mode ?? 0,
        mtime: header.mtime instanceof Date ? Math.floor(header.mtime.getTime() / 1000) : 0,
        linkTarget: (header as any).linkname || undefined,
      });
      count++;
      stream.resume();
    });
    extract.on("finish", () => resolve());
    extract.on("error", (e) => reject(e));
    (archiveStream as NodeJS.ReadableStream).pipe(extract);
  });

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    path: target,
    isDir: selfIsDir || entries.length > 0,
    truncated: count >= limit,
    entries,
  };
}

/** Read a single file via the Docker archive (tar) API, up to maxBytes. */
export async function readArchiveFile(
  getArchive: GetArchive,
  target: string,
  maxBytes: number,
): Promise<FileResult> {
  let archiveStream: NodeJS.ReadableStream;
  try {
    archiveStream = await getArchive(target);
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    throw new ArchiveError(e.statusCode ?? 404, "path_not_found", e.message ?? String(err));
  }

  const wantedBase = basename(target);
  let picked: { size: number; content: Buffer; truncated: boolean; binary: boolean } | null = null;
  let isDirTarget = false;

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();
    extract.on("entry", (header, stream, next) => {
      if (picked || isDirTarget) {
        stream.on("end", next);
        stream.resume();
        return;
      }
      const raw = header.name.replace(/\/$/, "");
      if (raw !== wantedBase) {
        stream.on("end", next);
        stream.resume();
        return;
      }
      if (header.type === "directory") {
        isDirTarget = true;
        stream.on("end", next);
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      let truncated = false;
      stream.on("data", (chunk: Buffer) => {
        if (received >= maxBytes) {
          truncated = true;
          return;
        }
        const remaining = maxBytes - received;
        if (chunk.length > remaining) {
          chunks.push(chunk.subarray(0, remaining));
          received += remaining;
          truncated = true;
        } else {
          chunks.push(chunk);
          received += chunk.length;
        }
      });
      stream.on("end", () => {
        const buf = Buffer.concat(chunks);
        picked = {
          size: header.size ?? received,
          content: buf,
          truncated,
          binary: looksBinary(buf),
        };
        next();
      });
      stream.on("error", next);
      stream.resume();
    });
    extract.on("finish", () => resolve());
    extract.on("error", (e) => reject(e));
    (archiveStream as NodeJS.ReadableStream).pipe(extract);
  });

  if (isDirTarget) {
    throw new ArchiveError(400, "is_directory");
  }
  if (!picked) {
    throw new ArchiveError(404, "not_found");
  }
  const file = picked as { size: number; content: Buffer; truncated: boolean; binary: boolean };
  return {
    path: target,
    size: file.size,
    truncated: file.truncated,
    binary: file.binary,
    content: file.binary ? file.content.toString("base64") : file.content.toString("utf-8"),
    encoding: file.binary ? "base64" : "utf-8",
  };
}

/** Write (overwrite/create) a single file via the Docker archive (tar) API. */
export async function writeArchiveFile(
  putArchive: PutArchive,
  target: string,
  content: Buffer,
  mode = 0o644,
): Promise<void> {
  const pack = tar.pack();
  pack.entry({ name: basename(target), mode, size: content.length }, content);
  pack.finalize();
  try {
    await putArchive(pack, dirname(target));
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    throw new ArchiveError(e.statusCode ?? 500, "write_failed", e.message ?? String(err));
  }
}
