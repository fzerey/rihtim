import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export class PathNotAllowedError extends Error {
  constructor(message = "path not allowed") {
    super(message);
    this.name = "PathNotAllowedError";
  }
}

/** Folders the API may read user-supplied paths from (compose files, build contexts). */
function allowedRoots(): string[] {
  return [config.dataDir, process.cwd()].map((r) => path.resolve(r));
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolves a user-supplied path and returns its real (symlink-free) location, or throws if it
 * falls outside the allowed roots or does not exist.
 *
 * The lexical check runs before any filesystem call, so a hostile path never reaches `fs`;
 * the second check after `realpath` stops symlinks inside a root from pointing outside it.
 * Callers must use the returned path, not the raw input.
 */
export async function resolveAllowedPath(raw: unknown): Promise<string> {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0") || raw.includes("://")) {
    throw new PathNotAllowedError("invalid path");
  }
  const roots = allowedRoots();
  const resolved = path.resolve(raw);
  if (!roots.some((root) => isInside(root, resolved))) throw new PathNotAllowedError();

  const real = await fs.realpath(resolved);
  const realRoots = await Promise.all(roots.map((r) => fs.realpath(r).catch(() => r)));
  if (!realRoots.some((root) => isInside(root, real))) throw new PathNotAllowedError();
  return real;
}

/** A bare file name inside a directory: no separators and not "." or "..". */
export function isPlainFileName(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && path.basename(name) === name && !name.includes("\\");
}
