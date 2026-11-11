import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The allowed roots are the data dir and the working directory, so point both at temp folders
// before the module (and its config) is loaded.
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rihtim-safe-path-")));
const dataDir = path.join(base, "data");
const workDir = path.join(base, "work");
const outside = path.join(base, "outside");
process.env.RIHTIM_DATA_DIR = dataDir;

const { isPlainFileName, PathNotAllowedError, resolveAllowedPath } = await import("../src/util/safe-path.js");

const originalCwd = process.cwd();

beforeAll(() => {
  for (const dir of [dataDir, workDir, outside, path.join(workDir, "app")]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(workDir, "app", "compose.yml"), "services: {}\n");
  fs.writeFileSync(path.join(dataDir, "stack.yml"), "services: {}\n");
  fs.writeFileSync(path.join(outside, "secret.txt"), "nope\n");
  // A junction works without admin rights on Windows and is a plain dir symlink elsewhere.
  fs.symlinkSync(outside, path.join(workDir, "escape"), "junction");
  process.chdir(workDir);
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(base, { recursive: true, force: true });
});

describe("resolveAllowedPath", () => {
  it("resolves relative paths inside the working directory", async () => {
    await expect(resolveAllowedPath("app/compose.yml")).resolves.toBe(path.join(workDir, "app", "compose.yml"));
  });

  it("accepts absolute paths inside the data directory", async () => {
    await expect(resolveAllowedPath(path.join(dataDir, "stack.yml"))).resolves.toBe(path.join(dataDir, "stack.yml"));
  });

  it.each([
    ["a parent-directory escape", "../outside/secret.txt"],
    ["a traversal hidden in the middle", "app/../../outside/secret.txt"],
    ["an absolute path elsewhere", path.join(outside, "secret.txt")],
    ["the allowed root itself", "."],
  ])("rejects %s", async (_label, input) => {
    await expect(resolveAllowedPath(input)).rejects.toBeInstanceOf(PathNotAllowedError);
  });

  it("rejects a symlink that points outside the allowed roots", async () => {
    await expect(resolveAllowedPath("escape/secret.txt")).rejects.toBeInstanceOf(PathNotAllowedError);
  });

  it.each([["", "empty"], ["app\0.yml", "NUL byte"], ["file:///etc/passwd", "URL"], [42, "non-string"]])(
    "rejects invalid input %j (%s)",
    async (input) => {
      await expect(resolveAllowedPath(input)).rejects.toThrow("invalid path");
    },
  );

  it("fails with ENOENT for a missing file inside a root", async () => {
    await expect(resolveAllowedPath("app/missing.yml")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.runIf(process.platform === "win32")("matches roots case-insensitively on Windows", async () => {
    const upper = path.join(workDir, "APP", "COMPOSE.YML").toUpperCase();
    await expect(resolveAllowedPath(upper)).resolves.toBe(path.join(workDir, "app", "compose.yml"));
  });
});

describe("isPlainFileName", () => {
  it.each(["Dockerfile", "Dockerfile.dev", "build.Containerfile"])("accepts %j", (name) => {
    expect(isPlainFileName(name)).toBe(true);
  });

  it.each(["", ".", "..", "dir/Dockerfile", "..\\Dockerfile", "/etc/passwd"])("rejects %j", (name) => {
    expect(isPlainFileName(name)).toBe(false);
  });
});
