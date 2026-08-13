import type { FastifyRequest } from "fastify";

class RateLimiter {
  private map = new Map<string, { count: number; reset: number }>();

  allow(key: string, limit = 10, windowMs = 60000): boolean {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now >= entry.reset) {
      this.map.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    if (entry.count < limit) {
      entry.count += 1;
      return true;
    }
    return false;
  }

  keyForRequest(req: FastifyRequest): string {
    const ip = (req as any).ip || (req as any).raw?.socket?.remoteAddress || "unknown";
    const route = (req as any).routerPath ?? (req as any).raw?.url ?? "unknown";
    return `${ip}:${route}`;
  }
}

export const rateLimiter = new RateLimiter();

export function checkRate(req: FastifyRequest, limit = 10, windowMs = 60000): boolean {
  const key = rateLimiter.keyForRequest(req);
  return rateLimiter.allow(key, limit, windowMs);
}
