import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { currentDocker } from "../contexts/docker-client.js";
import { demuxDockerLog } from "../util/demux.js";

/**
 * WebSocket routes:
 *   /ws/containers/:id/logs   - stream stdout+stderr
 *   /ws/containers/:id/stats  - normalized CPU/mem samples
 *   /ws/events                - docker system events
 *   /ws/containers/:id/exec   - interactive exec (bidirectional)
 *
 * @fastify/websocket v10 style: handler receives (socket, request).
 */
export const wsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>(
    "/ws/containers/:id/logs",
    { websocket: true },
    async (socket, req) => {
      const ws = socket as unknown as WebSocket;
      try {
        const docker = await currentDocker();
        const container = docker.getContainer(req.params.id);
        const logStream = (await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          tail: 200,
          timestamps: false,
        } as any)) as unknown as NodeJS.ReadableStream;

        logStream.on("data", (chunk: Buffer) => {
          if (ws.readyState === ws.OPEN) ws.send(demuxDockerLog(chunk));
        });
        logStream.on("end", () => ws.close());
        logStream.on("error", () => ws.close());
        ws.on("close", () => (logStream as any).destroy?.());
      } catch (err: any) {
        ws.send(JSON.stringify({ error: err.message }));
        ws.close();
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/ws/containers/:id/stats",
    { websocket: true },
    async (socket, req) => {
      const ws = socket as unknown as WebSocket;
      try {
        const docker = await currentDocker();
        const container = docker.getContainer(req.params.id);
        const stream = (await container.stats({ stream: true } as any)) as unknown as NodeJS.ReadableStream;

        stream.on("data", (chunk: Buffer) => {
          try {
            const raw = JSON.parse(chunk.toString("utf-8"));
            const sample = normalizeStats(req.params.id, raw);
            if (sample && ws.readyState === ws.OPEN) ws.send(JSON.stringify(sample));
          } catch {
            /* ignore malformed frame */
          }
        });
        stream.on("end", () => ws.close());
        stream.on("error", () => ws.close());
        ws.on("close", () => (stream as any).destroy?.());
      } catch (err: any) {
        ws.send(JSON.stringify({ error: err.message }));
        ws.close();
      }
    },
  );

  app.get("/ws/events", { websocket: true }, async (socket) => {
    const ws = socket as unknown as WebSocket;
    try {
      const docker = await currentDocker();
      const stream = await docker.getEvents();
      stream.on("data", (chunk: Buffer) => {
        if (ws.readyState === ws.OPEN) ws.send(chunk.toString("utf-8"));
      });
      stream.on("end", () => ws.close());
      stream.on("error", () => ws.close());
      ws.on("close", () => (stream as any).destroy?.());
    } catch (err: any) {
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    }
  });

  app.get<{ Params: { id: string }; Querystring: { shell?: string; cols?: string; rows?: string } }>(
    "/ws/containers/:id/exec",
    { websocket: true },
    async (socket, req) => {
      const ws = socket as unknown as WebSocket;
      const shell = (req.query.shell || "").trim();
      const cmd = shell
        ? shell.split(/\s+/)
        : ["/bin/sh", "-c", "command -v bash >/dev/null 2>&1 && exec bash || exec sh"];
      const cols = Math.max(20, Math.min(400, Number(req.query.cols) || 80));
      const rows = Math.max(5, Math.min(200, Number(req.query.rows) || 24));

      let stream: NodeJS.ReadWriteStream | null = null;
      let exec: any = null;
      try {
        const docker = await currentDocker();
        const container = docker.getContainer(req.params.id);
        exec = await container.exec({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: cmd,
        });
        stream = (await exec.start({ hijack: true, stdin: true, Tty: true })) as NodeJS.ReadWriteStream;
        try {
          await exec.resize({ w: cols, h: rows });
        } catch {
          // best-effort resize; ignore if the exec instance rejects it
        }

        stream.on("data", (chunk: Buffer) => {
          if (ws.readyState === ws.OPEN) ws.send(chunk);
        });
        stream.on("end", () => {
          if (ws.readyState === ws.OPEN) ws.close();
        });
        stream.on("error", () => {
          if (ws.readyState === ws.OPEN) ws.close();
        });

        ws.on("message", (data: Buffer, isBinary: boolean) => {
          if (!stream) return;
          if (isBinary) {
            stream.write(data as Buffer);
            return;
          }
          const text = data.toString("utf-8");
          try {
            const msg = JSON.parse(text);
            if (msg?.type === "resize" && exec) {
              const w = Math.max(20, Math.min(400, Number(msg.cols) || cols));
              const h = Math.max(5, Math.min(200, Number(msg.rows) || rows));
              exec.resize({ w, h }).catch(() => {});
              return;
            }
            if (typeof msg?.data === "string") {
              stream.write(msg.data);
              return;
            }
          } catch {
            stream.write(text);
          }
        });

        ws.on("close", () => {
          try {
            (stream as any)?.destroy?.();
          } catch {
            // stream may already be closed
          }
        });
      } catch (err: any) {
        try {
          ws.send(JSON.stringify({ error: err.message }));
        } catch {
          // socket may already be closed
        }
        ws.close();
      }
    },
  );
};

function normalizeStats(id: string, s: any) {
  if (!s?.cpu_stats || !s?.precpu_stats) return null;
  const cpuDelta =
    (s.cpu_stats.cpu_usage?.total_usage ?? 0) -
    (s.precpu_stats.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
  const onlineCpus =
    s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage?.percpu_usage?.length ?? 1;
  const cpuPercent =
    systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

  const memUsage = (s.memory_stats?.usage ?? 0) - (s.memory_stats?.stats?.cache ?? 0);
  const memLimit = s.memory_stats?.limit ?? 0;

  let rx = 0;
  let tx = 0;
  for (const net of Object.values<any>(s.networks ?? {})) {
    rx += net.rx_bytes ?? 0;
    tx += net.tx_bytes ?? 0;
  }

  let blkRead = 0;
  let blkWrite = 0;
  for (const io of s.blkio_stats?.io_service_bytes_recursive ?? []) {
    if (io.op === "Read") blkRead += io.value;
    if (io.op === "Write") blkWrite += io.value;
  }

  return {
    id,
    cpuPercent,
    memoryUsage: memUsage,
    memoryLimit: memLimit,
    memoryPercent: memLimit > 0 ? (memUsage / memLimit) * 100 : 0,
    networkRx: rx,
    networkTx: tx,
    blockRead: blkRead,
    blockWrite: blkWrite,
    timestamp: Date.now(),
  };
}
