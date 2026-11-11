import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRate, rateLimiter } from "../src/util/rate-limit.js";

const request = (ip: string, url: string) => ({ ip, raw: { url } }) as unknown as FastifyRequest;

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit within a window, then blocks", () => {
    const key = "1.1.1.1:/limit";
    expect([1, 2, 3].map(() => rateLimiter.allow(key, 3, 60_000))).toEqual([true, true, true]);
    expect(rateLimiter.allow(key, 3, 60_000)).toBe(false);
  });

  it("opens again once the window has passed", () => {
    const key = "1.1.1.1:/window";
    rateLimiter.allow(key, 1, 1_000);
    expect(rateLimiter.allow(key, 1, 1_000)).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(rateLimiter.allow(key, 1, 1_000)).toBe(true);
  });

  it("counts each client IP and route separately", () => {
    expect(checkRate(request("10.0.0.1", "/api/build"), 1)).toBe(true);
    expect(checkRate(request("10.0.0.1", "/api/build"), 1)).toBe(false);
    expect(checkRate(request("10.0.0.2", "/api/build"), 1)).toBe(true);
    expect(checkRate(request("10.0.0.1", "/api/contexts"), 1)).toBe(true);
  });
});
