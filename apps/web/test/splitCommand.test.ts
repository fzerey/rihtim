import { describe, expect, it } from "vitest";
import { splitCommand } from "../src/lib/splitCommand";

describe("splitCommand", () => {
  it("splits plain words on any whitespace", () => {
    expect(splitCommand("nginx -g  daemon\toff")).toEqual(["nginx", "-g", "daemon", "off"]);
  });

  it("returns no arguments for blank input", () => {
    expect(splitCommand("")).toEqual([]);
    expect(splitCommand("   ")).toEqual([]);
  });

  it("keeps a single-quoted script as one argument", () => {
    expect(splitCommand("sh -c 'echo hi; sleep 600'")).toEqual(["sh", "-c", "echo hi; sleep 600"]);
  });

  it("keeps a double-quoted script as one argument", () => {
    expect(splitCommand('sh -c "echo $HOME"')).toEqual(["sh", "-c", "echo $HOME"]);
  });

  it("treats backslashes literally inside single quotes", () => {
    expect(splitCommand("echo 'a\\nb'")).toEqual(["echo", "a\\nb"]);
  });

  it("unescapes \\\" and \\\\ inside double quotes only", () => {
    expect(splitCommand('echo "say \\"hi\\" \\\\ \\n"')).toEqual(["echo", 'say "hi" \\ \\n']);
  });

  it("joins adjacent quoted and unquoted parts into one word", () => {
    expect(splitCommand(`--name='my app'-1 a"b"c`)).toEqual(["--name=my app-1", "abc"]);
  });

  it("keeps empty quoted strings as arguments", () => {
    expect(splitCommand(`printf '' ""`)).toEqual(["printf", "", ""]);
  });

  it("escapes a space outside quotes with a backslash", () => {
    expect(splitCommand("cat my\\ file.txt")).toEqual(["cat", "my file.txt"]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => splitCommand("sh -c 'echo hi")).toThrow(/Unterminated ' quote/);
    expect(() => splitCommand('echo "oops')).toThrow(/Unterminated " quote/);
  });
});
