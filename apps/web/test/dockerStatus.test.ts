import { describe, expect, it } from "vitest";
import { formatAgo, formatDuration, parseDockerStatus, parseDuration } from "../src/lib/dockerStatus";

describe("parseDuration", () => {
  it.each([
    ["Less than a second", { value: 1, unit: "second" }],
    ["About a minute", { value: 1, unit: "minute" }],
    ["About an hour", { value: 1, unit: "hour" }],
    ["1 second", { value: 1, unit: "second" }],
    ["45 seconds", { value: 45, unit: "second" }],
    ["3 weeks", { value: 3, unit: "week" }],
    ["2 Years", { value: 2, unit: "year" }],
  ])("parses %j", (text, expected) => {
    expect(parseDuration(text)).toEqual(expected);
  });

  it("returns undefined for text Docker does not produce", () => {
    expect(parseDuration("a while")).toBeUndefined();
    expect(parseDuration("3 fortnights")).toBeUndefined();
  });
});

describe("parseDockerStatus", () => {
  it("parses a running container", () => {
    expect(parseDockerStatus("Up 5 minutes")).toEqual({
      kind: "up",
      duration: { value: 5, unit: "minute" },
    });
  });

  it("parses health and paused suffixes", () => {
    expect(parseDockerStatus("Up About an hour (healthy)")).toMatchObject({
      kind: "up",
      health: "healthy",
      duration: { value: 1, unit: "hour" },
    });
    expect(parseDockerStatus("Up 2 days (health: starting)").health).toBe("starting");
    expect(parseDockerStatus("Up 2 days (unhealthy)").health).toBe("unhealthy");
    expect(parseDockerStatus("Up 3 hours (Paused)")).toMatchObject({ kind: "up", paused: true });
  });

  it("parses exited and restarting containers with their exit code", () => {
    expect(parseDockerStatus("Exited (137) 2 hours ago")).toEqual({
      kind: "exited",
      exitCode: 137,
      duration: { value: 2, unit: "hour" },
    });
    expect(parseDockerStatus("Restarting (1) Less than a second ago")).toMatchObject({
      kind: "restarting",
      exitCode: 1,
    });
    expect(parseDockerStatus("Exited (-1) 5 seconds ago").exitCode).toBe(-1);
  });

  it.each([
    ["Created", "created"],
    ["Dead", "dead"],
    ["Removal In Progress", "removing"],
    ["something new", "unknown"],
    ["", "unknown"],
  ])("maps %j to %s", (status, kind) => {
    expect(parseDockerStatus(status).kind).toBe(kind);
  });
});

describe("formatting", () => {
  it("formats durations and relative times for the locale", () => {
    expect(formatDuration({ value: 3, unit: "week" }, "en")).toBe("3 weeks");
    expect(formatAgo({ value: 2, unit: "hour" }, "en")).toBe("2 hours ago");
    expect(formatAgo({ value: 1, unit: "day" }, "en")).toBe("yesterday");
  });
});
