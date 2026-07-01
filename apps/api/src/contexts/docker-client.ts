import Docker from "dockerode";
import type { DockerContext } from "@rihtim/shared";
import { ensureWslBridge } from "./wsl-bridge.js";
import { contextStore } from "./store.js";

const clients = new Map<string, Docker>();

export async function dockerFor(ctx: DockerContext): Promise<Docker> {
  const cached = clients.get(ctx.id);
  if (cached) return cached;

  let docker: Docker;
  switch (ctx.kind) {
    case "npipe":
    case "socket":
      docker = new Docker({ socketPath: ctx.socketPath });
      break;
    case "tcp":
      docker = new Docker({
        host: ctx.host,
        port: ctx.port ?? 2375,
        protocol: ctx.tls ? "https" : "http",
        ca: ctx.tls?.ca,
        cert: ctx.tls?.cert,
        key: ctx.tls?.key,
      });
      break;
    case "ssh": {
      if (!ctx.sshHost) throw new Error("ssh context missing sshHost");
      docker = new Docker({
        protocol: "ssh",
        host: ctx.sshHost,
      } as any);
      break;
    }
    case "wsl": {
      if (!ctx.wslDistro) throw new Error("wsl context missing wslDistro");
      const bridge = await ensureWslBridge(ctx.wslDistro);
      docker = new Docker({ host: "127.0.0.1", port: bridge.port, protocol: "http" });
      break;
    }
    default:
      throw new Error(`unsupported context kind: ${(ctx as any).kind}`);
  }

  clients.set(ctx.id, docker);
  return docker;
}

export async function currentDocker(): Promise<Docker> {
  const ctx = await contextStore.current();
  return dockerFor(ctx);
}

export function invalidateClient(id: string) {
  clients.delete(id);
}
