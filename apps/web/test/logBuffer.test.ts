import { describe, expect, it } from "vitest";
import { filterLines, keepLastLines } from "../src/lib/logBuffer";

describe("keepLastLines", () => {
  it("keeps text that is within the limit", () => {
    expect(keepLastLines("a\nb\n", 2)).toBe("a\nb\n");
    expect(keepLastLines("", 5)).toBe("");
  });

  it("drops the oldest lines beyond the limit", () => {
    expect(keepLastLines("1\n2\n3\n4\n", 2)).toBe("3\n4\n");
  });

  it("counts a trailing partial line", () => {
    expect(keepLastLines("1\n2\n3\npart", 2)).toBe("3\npart");
  });

  it("returns nothing for a zero limit", () => {
    expect(keepLastLines("1\n2\n", 0)).toBe("");
  });

  it("stays bounded for a large stream", () => {
    const big = Array.from({ length: 50_000 }, (_, i) => `line ${i}\n`).join("");
    const kept = keepLastLines(big, 1000);
    expect(kept.split("\n").filter(Boolean)).toHaveLength(1000);
    expect(kept.startsWith("line 49000\n")).toBe(true);
  });
});

describe("filterLines", () => {
  it("keeps matching lines case-insensitively with their line breaks", () => {
    expect(filterLines("GET /a 200\nPOST /b 500\nget /c 404\n", "get")).toBe("GET /a 200\nget /c 404\n");
  });

  it("returns nothing when no line matches", () => {
    expect(filterLines("a\nb\n", "zzz")).toBe("");
  });
});
