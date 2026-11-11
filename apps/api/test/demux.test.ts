import { describe, expect, it } from "vitest";
import { demuxDockerLog } from "../src/util/demux.js";

/** Builds one Docker multiplexed frame: [type, 0, 0, 0, size(4 bytes BE), payload]. */
function frame(type: 0 | 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, "utf-8");
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe("demuxDockerLog", () => {
  it("passes strings through unchanged", () => {
    expect(demuxDockerLog("already plain\n")).toBe("already plain\n");
  });

  it("strips the frame header from a single stdout frame", () => {
    expect(demuxDockerLog(frame(1, "hello\n"))).toBe("hello\n");
  });

  it("joins stdout and stderr frames in order", () => {
    const chunk = Buffer.concat([frame(1, "out 1\n"), frame(2, "err 1\n"), frame(1, "out 2\n")]);
    expect(demuxDockerLog(chunk)).toBe("out 1\nerr 1\nout 2\n");
  });

  it("keeps multi-byte UTF-8 text intact", () => {
    expect(demuxDockerLog(frame(1, "Rıhtım ⚓\n"))).toBe("Rıhtım ⚓\n");
  });

  it("drops a trailing frame that is cut off", () => {
    const partial = frame(1, "second frame").subarray(0, 12);
    expect(demuxDockerLog(Buffer.concat([frame(1, "first\n"), partial]))).toBe("first\n");
  });

  it("treats data without a stream header as raw text (TTY containers)", () => {
    expect(demuxDockerLog(Buffer.from("plain tty output\n"))).toBe("plain tty output\n");
  });

  it("treats chunks shorter than a header as raw text", () => {
    expect(demuxDockerLog(Buffer.from("hi"))).toBe("hi");
  });
});
