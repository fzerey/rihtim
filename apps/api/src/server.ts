import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { contextRoutes } from "./routes/contexts.js";
import { registryRoutes } from "./routes/registries.js";
import {
  containerRoutes,
  composeRoutes,
  imageRoutes,
  volumeRoutes,
  networkRoutes,
  systemRoutes,
  buildRoutes,
} from "./routes/docker.js";
import { wsRoutes } from "./routes/ws.js";
import { closeAllBridges } from "./contexts/wsl-bridge.js";

const app = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss.l" } },
  },
});

await app.register(cors, { origin: config.corsOrigin, credentials: true });
await app.register(websocket);

app.setErrorHandler((err, _req, reply) => {
  const code = typeof (err as NodeJS.ErrnoException).code === "string"
    ? (err as NodeJS.ErrnoException).code
    : undefined;
  const connErrors = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ENOENT",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "ETIMEDOUT",
  ]);
  if (code && connErrors.has(code)) {
    return reply.code(503).send({
      error: "docker_unreachable",
      code,
      message:
        "Cannot reach the active Docker context. Make sure the engine is running or pick another context in Settings.",
    });
  }
  app.log.error(err);
  return reply.code(err.statusCode ?? 500).send({
    error: err.name ?? "InternalError",
    message: err.message,
  });
});

app.get("/health", async () => ({ ok: true, name: "rihtim-api" }));

await app.register(contextRoutes, { prefix: "/api" });
await app.register(registryRoutes, { prefix: "/api" });
await app.register(containerRoutes, { prefix: "/api" });
await app.register(composeRoutes, { prefix: "/api" });
await app.register(imageRoutes, { prefix: "/api" });
await app.register(volumeRoutes, { prefix: "/api" });
await app.register(networkRoutes, { prefix: "/api" });
await app.register(systemRoutes, { prefix: "/api" });
await app.register(buildRoutes, { prefix: "/api" });
await app.register(wsRoutes);

const stop = async () => {
  closeAllBridges();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
