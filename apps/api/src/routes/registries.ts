import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { registryStore } from "../registries/store.js";
import { checkRate } from "../util/rate-limit.js";

const registrySchema = z.object({
  name: z.string().min(1, "Registry name is required"),
  url: z.string().min(1, "Registry URL is required")
    .transform((url) => {
      // Add https:// if no protocol is provided
      if (!url.match(/^[a-z][a-z0-9+.-]*:\/\//i)) {
        return `https://${url}`;
      }
      return url;
    })
    .refine(
      (url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
      "Invalid URL format"
    ),
  isPublic: z.boolean().optional().default(true),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const registryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    if (!checkRate(req, 6, 60_000)) return reply.code(429).send({ error: "rate_limited" });
  });
  app.get("/registries", async () => registryStore.list());

  app.post("/registries", async (req, reply) => {
    const parsed = registrySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", detail: parsed.error.message });
    }
    return registryStore.add(parsed.data);
  });

  app.patch<{ Params: { id: string } }>("/registries/:id", async (req, reply) => {
    const parsed = registrySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", detail: parsed.error.message });
    }
    return registryStore.update(req.params.id, parsed.data);
  });

  app.delete<{ Params: { id: string } }>("/registries/:id", async (req, reply) => {
    await registryStore.remove(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/registries/:id/test", async (req, reply) => {
    const registry = await registryStore.get(req.params.id);
    if (!registry) {
      return reply.code(404).send({ error: "registry not found" });
    }

    try {
      const headers: Record<string, string> = {};
      
      // Add basic auth if credentials are provided
      if (registry.username && registry.password) {
        const auth = Buffer.from(`${registry.username}:${registry.password}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      }

      // Try to fetch the registry catalog or version endpoint
      const url = new URL("/v2/", registry.url);
      const res = await fetch(url.toString(), {
        method: "GET",
        headers,
      });

      if (res.status === 200 || res.status === 401 || res.status === 403) {
        // 200 = success, 401/403 = credentials required (registry exists)
        return {
          ok: true,
          status: res.status,
          message: res.status === 200 ? "Connection successful" : "Registry found (credentials may be needed)",
        };
      }

      if (res.status === 404) {
        return {
          ok: false,
          status: res.status,
          message: "Registry endpoint not found",
        };
      }

      return {
        ok: false,
        status: res.status,
        message: `Registry returned status ${res.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: message,
        message: `Connection failed: ${message}`,
      };
    }
  });
};
