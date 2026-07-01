import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contextStore } from "../contexts/store.js";
import { dockerFor, invalidateClient } from "../contexts/docker-client.js";

const kinds = z.enum(["npipe", "socket", "tcp", "ssh", "wsl"]);

const contextSchema = z.object({
  name: z.string().min(1),
  kind: kinds,
  socketPath: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  sshHost: z.string().optional(),
  wslDistro: z.string().optional(),
  tls: z
    .object({
      ca: z.string().optional(),
      cert: z.string().optional(),
      key: z.string().optional(),
    })
    .optional(),
  current: z.boolean().optional(),
});

export const contextRoutes: FastifyPluginAsync = async (app) => {
  app.get("/contexts", async () => contextStore.list());

  app.post("/contexts", async (req, reply) => {
    const parsed = contextSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", detail: parsed.error.message });
    }
    return contextStore.add(parsed.data);
  });

  app.patch<{ Params: { id: string } }>("/contexts/:id", async (req, reply) => {
    const parsed = contextSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", detail: parsed.error.message });
    }
    invalidateClient(req.params.id);
    return contextStore.update(req.params.id, parsed.data);
  });

  app.delete<{ Params: { id: string } }>("/contexts/:id", async (req, reply) => {
    invalidateClient(req.params.id);
    await contextStore.remove(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/contexts/:id/select", async (req) => {
    return contextStore.setCurrent(req.params.id);
  });

  app.post<{ Params: { id: string } }>("/contexts/:id/test", async (req, reply) => {
    const ctx = await contextStore.get(req.params.id);
    if (!ctx) return reply.code(404).send({ error: "not found" });
    try {
      const docker = await dockerFor(ctx);
      const version = await docker.version();
      return {
        ok: true,
        version: {
          apiVersion: version.ApiVersion,
          version: version.Version,
          os: version.Os,
          arch: version.Arch,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });
};
