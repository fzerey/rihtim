import type { FastifyPluginAsync } from "fastify";
import { PassThrough } from "node:stream";
import * as tar from "tar-stream";
import { currentDocker } from "../contexts/docker-client.js";
import { demuxDockerLog } from "../util/demux.js";
import type {
  ContainerSummary,
  ImageSummary,
  VolumeSummary,
  NetworkSummary,
} from "@rihtim/shared";

function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return "/";
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return true;
    if (b < 7 && b !== 0) return true;
  }
  return false;
}

export const containerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/containers", async (req) => {
    const all = (req.query as any)?.all !== "false";
    const docker = await currentDocker();
    const list = await docker.listContainers({ all });
    const mapped: ContainerSummary[] = list.map((c) => ({
      id: c.Id,
      names: c.Names,
      image: c.Image,
      imageId: c.ImageID,
      command: c.Command,
      createdAt: c.Created,
      state: c.State,
      status: c.Status,
      ports: c.Ports.map((p) => ({
        ip: p.IP,
        privatePort: p.PrivatePort,
        publicPort: p.PublicPort,
        type: p.Type,
      })),
      labels: c.Labels ?? {},
      mounts: (c.Mounts ?? []).map((m) => ({
        source: m.Source,
        destination: m.Destination,
        mode: m.Mode,
        type: m.Type,
      })),
      networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
    }));
    return mapped;
  });

  app.get<{ Params: { id: string } }>("/containers/:id", async (req) => {
    const docker = await currentDocker();
    return docker.getContainer(req.params.id).inspect();
  });

  const actions = ["start", "stop", "restart", "pause", "unpause", "kill"] as const;
  for (const action of actions) {
    app.post<{ Params: { id: string } }>(`/containers/:id/${action}`, async (req, reply) => {
      const docker = await currentDocker();
      const container = docker.getContainer(req.params.id);
      try {
        await (container as any)[action]();
        return reply.code(204).send();
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    });
  }

  app.delete<{ Params: { id: string }; Querystring: { force?: string; v?: string } }>(
    "/containers/:id",
    async (req, reply) => {
      const docker = await currentDocker();
      await docker.getContainer(req.params.id).remove({
        force: req.query.force === "true",
        v: req.query.v === "true",
      });
      return reply.code(204).send();
    },
  );

  app.post<{ Body: any }>("/containers", async (req, reply) => {
    const docker = await currentDocker();
    const created = await docker.createContainer(req.body as any);
    return reply.code(201).send({ id: (created as any).id });
  });

  app.post("/containers/prune", async () => {
    const docker = await currentDocker();
    return docker.pruneContainers();
  });

  app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
    "/containers/:id/logs",
    async (req) => {
      const docker = await currentDocker();
      const container = docker.getContainer(req.params.id);
      const tail = Number(req.query.tail ?? 500);
      const buf = (await container.logs({
        follow: false,
        stdout: true,
        stderr: true,
        tail,
        timestamps: false,
      } as any)) as unknown as Buffer;
      return { text: demuxDockerLog(buf) };
    },
  );

  app.get<{ Params: { id: string } }>("/containers/:id/top", async (req) => {
    const docker = await currentDocker();
    return docker.getContainer(req.params.id).top();
  });

  app.get<{ Params: { id: string } }>("/containers/:id/changes", async (req) => {
    const docker = await currentDocker();
    return (docker.getContainer(req.params.id) as any).changes();
  });

  app.post<{
    Params: { id: string };
    Body: { cmd: string[]; workdir?: string; user?: string };
  }>("/containers/:id/exec-cmd", async (req, reply) => {
    const { cmd, workdir, user } = req.body ?? ({} as any);
    if (!Array.isArray(cmd) || cmd.length === 0) {
      return reply.code(400).send({ error: "cmd (string[]) required" });
    }
    const docker = await currentDocker();
    const container = docker.getContainer(req.params.id);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workdir,
      User: user,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const stdoutSink = new PassThrough();
      const stderrSink = new PassThrough();
      stdoutSink.on("data", (c: Buffer) => stdoutChunks.push(c));
      stderrSink.on("data", (c: Buffer) => stderrChunks.push(c));
      (docker as any).modem.demuxStream(stream, stdoutSink, stderrSink);
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const info = await exec.inspect();
    return {
      exitCode: info.ExitCode ?? null,
      stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
      stderr: Buffer.concat(stderrChunks).toString("utf-8"),
    };
  });

  // List directory entries via Docker archive API (no shell/ls required inside container).
  app.get<{
    Params: { id: string };
    Querystring: { path?: string; limit?: string };
  }>("/containers/:id/fs", async (req, reply) => {
    const target = req.query.path && req.query.path.length > 0 ? req.query.path : "/";
    const limit = Math.max(1, Math.min(Number(req.query.limit ?? 2000), 20000));
    const docker = await currentDocker();
    const container = docker.getContainer(req.params.id);

    let archiveStream: NodeJS.ReadableStream;
    try {
      archiveStream = await (container as any).getArchive({ path: target });
    } catch (err: any) {
      return reply.code(err.statusCode ?? 404).send({
        error: "path_not_found",
        message: err?.message ?? String(err),
      });
    }

    type FsEntry = {
      name: string;
      isDir: boolean;
      isLink: boolean;
      size: number;
      mode: number;
      mtime: number;
      linkTarget?: string;
    };

    const rootBase = target === "/" ? "" : basename(target);
    const entries: FsEntry[] = [];
    let selfIsDir = false;
    let count = 0;
    const sampleNames: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const extract = tar.extract();
      extract.on("entry", (header, stream, next) => {
        stream.on("end", next);
        stream.on("error", next);

        if (count >= limit) {
          stream.resume();
          return;
        }

        if (sampleNames.length < 10) sampleNames.push(header.name);

        // Normalize: strip trailing "/", leading "./", leading "/"
        let raw = header.name.replace(/\/$/, "");
        if (raw.startsWith("./")) raw = raw.slice(2);
        if (raw.startsWith("/")) raw = raw.slice(1);

        // "self" entry: the target directory itself
        if (raw === "" || raw === "." || (rootBase !== "" && raw === rootBase)) {
          if (header.type === "directory") selfIsDir = true;
          stream.resume();
          return;
        }

        // Determine relative path under target
        let rel: string;
        if (rootBase === "") {
          rel = raw;
        } else {
          const prefix = `${rootBase}/`;
          if (!raw.startsWith(prefix)) {
            stream.resume();
            return;
          }
          rel = raw.slice(prefix.length);
        }

        if (!rel || rel.includes("/")) {
          stream.resume();
          return;
        }

        const isDir = header.type === "directory";
        const isLink = header.type === "symlink" || header.type === "link";
        entries.push({
          name: rel,
          isDir,
          isLink,
          size: header.size ?? 0,
          mode: header.mode ?? 0,
          mtime: header.mtime instanceof Date ? Math.floor(header.mtime.getTime() / 1000) : 0,
          linkTarget: (header as any).linkname || undefined,
        });
        count++;
        stream.resume();
      });
      extract.on("finish", () => resolve());
      extract.on("error", (e) => reject(e));
      (archiveStream as NodeJS.ReadableStream).pipe(extract);
    });

    if (entries.length === 0) {
      req.log.info({ target, sampleNames }, "empty archive listing");
    }

    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      path: target,
      isDir: selfIsDir || entries.length > 0,
      truncated: count >= limit,
      entries,
    };
  });

  // Read a single file (up to 1 MiB by default) via archive API.
  app.get<{
    Params: { id: string };
    Querystring: { path?: string; max?: string };
  }>("/containers/:id/file", async (req, reply) => {
    const target = req.query.path;
    if (!target) return reply.code(400).send({ error: "path required" });
    const maxBytes = Math.max(1024, Math.min(Number(req.query.max ?? 1_048_576), 16_777_216));
    const docker = await currentDocker();
    const container = docker.getContainer(req.params.id);

    let archiveStream: NodeJS.ReadableStream;
    try {
      archiveStream = await (container as any).getArchive({ path: target });
    } catch (err: any) {
      return reply.code(err.statusCode ?? 404).send({
        error: "path_not_found",
        message: err?.message ?? String(err),
      });
    }

    const wantedBase = basename(target);
    let picked: { size: number; content: Buffer; truncated: boolean; binary: boolean } | null =
      null;
    let isDirTarget = false;

    await new Promise<void>((resolve, reject) => {
      const extract = tar.extract();
      extract.on("entry", (header, stream, next) => {
        if (picked || isDirTarget) {
          stream.on("end", next);
          stream.resume();
          return;
        }
        const raw = header.name.replace(/\/$/, "");
        if (raw !== wantedBase) {
          stream.on("end", next);
          stream.resume();
          return;
        }
        if (header.type === "directory") {
          isDirTarget = true;
          stream.on("end", next);
          stream.resume();
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let truncated = false;
        stream.on("data", (chunk: Buffer) => {
          if (received >= maxBytes) {
            truncated = true;
            return;
          }
          const remaining = maxBytes - received;
          if (chunk.length > remaining) {
            chunks.push(chunk.subarray(0, remaining));
            received += remaining;
            truncated = true;
          } else {
            chunks.push(chunk);
            received += chunk.length;
          }
        });
        stream.on("end", () => {
          const buf = Buffer.concat(chunks);
          picked = {
            size: header.size ?? received,
            content: buf,
            truncated,
            binary: looksBinary(buf),
          };
          next();
        });
        stream.on("error", next);
        stream.resume();
      });
      extract.on("finish", () => resolve());
      extract.on("error", (e) => reject(e));
      (archiveStream as NodeJS.ReadableStream).pipe(extract);
    });

    if (isDirTarget) {
      return reply.code(400).send({ error: "is_directory" });
    }
    if (!picked) {
      return reply.code(404).send({ error: "not_found" });
    }
    return {
      path: target,
      size: (picked as any).size,
      truncated: (picked as any).truncated,
      binary: (picked as any).binary,
      content: (picked as any).binary
        ? (picked as any).content.toString("base64")
        : (picked as any).content.toString("utf-8"),
      encoding: (picked as any).binary ? "base64" : "utf-8",
    };
  });
};

export const imageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/images", async () => {
    const docker = await currentDocker();
    const list = await docker.listImages();
    const inspected = await Promise.all(
      list.map(async (i) => {
        try {
          const info = await docker.getImage(i.Id).inspect();
          const raw = (info as any).Metadata?.LastTagTime;
          const ms = raw ? Date.parse(raw) : NaN;
          return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
        } catch {
          return undefined;
        }
      }),
    );
    const mapped: ImageSummary[] = list.map((i, idx) => ({
      id: i.Id,
      parentId: i.ParentId,
      repoTags: i.RepoTags ?? [],
      repoDigests: i.RepoDigests ?? [],
      createdAt: i.Created,
      pulledAt: inspected[idx],
      size: i.Size,
      virtualSize: (i as any).VirtualSize ?? i.Size,
      labels: i.Labels ?? {},
      containers: (i as any).Containers ?? -1,
    }));
    return mapped;
  });

  app.get<{ Params: { id: string } }>("/images/:id", async (req) => {
    const docker = await currentDocker();
    return docker.getImage(req.params.id).inspect();
  });

  app.post<{ Body: { fromImage: string; tag?: string } }>("/images/pull", async (req, reply) => {
    const docker = await currentDocker();
    const { fromImage, tag } = req.body ?? { fromImage: "" };
    if (!fromImage) return reply.code(400).send({ error: "fromImage required" });

    const stream = await docker.pull(tag ? `${fromImage}:${tag}` : fromImage);
    reply.raw.setHeader("Content-Type", "application/x-ndjson");
    stream.pipe(reply.raw);
    return reply;
  });

  app.get<{ Querystring: { term?: string; limit?: string } }>("/images/search", async (req, reply) => {
    const term = (req.query.term ?? "").trim();
    if (!term) return reply.code(400).send({ error: "term required" });
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? "25", 10) || 25, 1), 100);
    const docker = await currentDocker();
    const results = await new Promise<any[]>((resolve, reject) => {
      (docker as any).searchImages({ term, limit }, (err: any, out: any) => {
        if (err) return reject(err);
        resolve(Array.isArray(out) ? out : []);
      });
    });
    return results.map((r) => ({
      name: r.name,
      description: r.description ?? "",
      isOfficial: !!r.is_official,
      isAutomated: !!r.is_automated,
      starCount: r.star_count ?? 0,
    }));
  });

  app.get<{ Params: { name: string } }>("/images/hub/:name/tags", async (req, reply) => {
    const name = decodeURIComponent(req.params.name);
    const repo = name.includes("/") ? name : `library/${name}`;
    const url = `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=50&ordering=last_updated`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return reply.code(resp.status).send({ error: `hub responded ${resp.status}` });
      const json = (await resp.json()) as any;
      const tags = (json.results ?? []).map((t: any) => ({
        name: t.name,
        lastUpdated: t.last_updated,
        size: t.full_size,
      }));
      return { tags };
    } catch (err: any) {
      return reply.code(502).send({ error: err?.message ?? "hub fetch failed" });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    "/images/:id",
    async (req, reply) => {
      const docker = await currentDocker();
      await docker.getImage(req.params.id).remove({ force: req.query.force === "true" });
      return reply.code(204).send();
    },
  );

  app.post("/images/prune", async () => {
    const docker = await currentDocker();
    return docker.pruneImages({ filters: { dangling: { false: true } } as any });
  });
};

export const volumeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/volumes", async () => {
    const docker = await currentDocker();
    const res = await docker.listVolumes();
    const mapped: VolumeSummary[] = (res.Volumes ?? []).map((v: any) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      createdAt: v.CreatedAt,
      labels: v.Labels ?? {},
      scope: v.Scope,
    }));
    return mapped;
  });

  app.post<{ Body: any }>("/volumes", async (req) => {
    const docker = await currentDocker();
    return docker.createVolume(req.body as any);
  });

  app.delete<{ Params: { name: string }; Querystring: { force?: string } }>(
    "/volumes/:name",
    async (req, reply) => {
      const docker = await currentDocker();
      await docker.getVolume(req.params.name).remove({ force: req.query.force === "true" });
      return reply.code(204).send();
    },
  );

  app.post("/volumes/prune", async () => {
    const docker = await currentDocker();
    return docker.pruneVolumes();
  });
};

export const networkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/networks", async () => {
    const docker = await currentDocker();
    const list = await docker.listNetworks();
    const mapped: NetworkSummary[] = list.map((n) => ({
      id: n.Id,
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope,
      internal: n.Internal,
      attachable: n.Attachable,
      ingress: n.Ingress,
      labels: n.Labels ?? {},
      ipam: n.IPAM
        ? {
            driver: n.IPAM.Driver,
            config: (n.IPAM.Config ?? []).map((c: any) => ({
              subnet: c.Subnet,
              gateway: c.Gateway,
            })),
          }
        : undefined,
    }));
    return mapped;
  });

  app.get<{ Params: { id: string } }>("/networks/:id", async (req) => {
    const docker = await currentDocker();
    return docker.getNetwork(req.params.id).inspect();
  });

  app.post<{ Body: any }>("/networks", async (req) => {
    const docker = await currentDocker();
    return docker.createNetwork(req.body as any);
  });

  app.delete<{ Params: { id: string } }>("/networks/:id", async (req, reply) => {
    const docker = await currentDocker();
    await docker.getNetwork(req.params.id).remove();
    return reply.code(204).send();
  });

  app.post("/networks/prune", async () => {
    const docker = await currentDocker();
    return docker.pruneNetworks();
  });
};

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/system/info", async () => {
    const docker = await currentDocker();
    const info = await docker.info();
    return {
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      images: info.Images,
      serverVersion: info.ServerVersion,
      operatingSystem: info.OperatingSystem,
      architecture: info.Architecture,
      ncpu: info.NCPU,
      memTotal: info.MemTotal,
      kernelVersion: info.KernelVersion,
      dockerRootDir: info.DockerRootDir,
      name: info.Name,
    };
  });

  app.get("/system/version", async () => {
    const docker = await currentDocker();
    return docker.version();
  });

  app.get("/system/df", async () => {
    const docker = await currentDocker();
    return docker.df();
  });

  app.get("/system/storage", async () => {
    const docker = await currentDocker();
    const df: any = await docker.df();
    const imgs: any[] = df.Images ?? [];
    const cts: any[] = df.Containers ?? [];
    const vols: any[] = df.Volumes ?? [];
    const bc: any[] = df.BuildCache ?? [];

    const imagesSize = imgs.reduce(
      (a, i) => a + Math.max(0, (i.Size ?? 0) - (i.SharedSize ?? 0)),
      0,
    );
    const imagesReclaimable = imgs
      .filter((i) => (i.Containers ?? 0) === 0)
      .reduce((a, i) => a + Math.max(0, (i.Size ?? 0) - (i.SharedSize ?? 0)), 0);

    const containersSize = cts.reduce((a, c) => a + (c.SizeRw ?? 0), 0);
    const containersReclaimable = cts
      .filter((c) => c.State !== "running")
      .reduce((a, c) => a + (c.SizeRw ?? 0), 0);

    const volumesSize = vols.reduce(
      (a, v) => a + (v.UsageData?.Size ?? 0),
      0,
    );
    const volumesReclaimable = vols
      .filter((v) => (v.UsageData?.RefCount ?? 0) === 0)
      .reduce((a, v) => a + (v.UsageData?.Size ?? 0), 0);

    const buildCacheSize = bc.reduce((a, b) => a + (b.Size ?? 0), 0);
    const buildCacheReclaimable = bc
      .filter((b) => !b.InUse)
      .reduce((a, b) => a + (b.Size ?? 0), 0);

    const totalSize =
      imagesSize + containersSize + volumesSize + buildCacheSize;
    const totalReclaimable =
      imagesReclaimable +
      containersReclaimable +
      volumesReclaimable +
      buildCacheReclaimable;

    return {
      images: {
        total: imgs.length,
        active: imgs.filter((i) => (i.Containers ?? 0) > 0).length,
        size: imagesSize,
        reclaimable: imagesReclaimable,
      },
      containers: {
        total: cts.length,
        active: cts.filter((c) => c.State === "running").length,
        size: containersSize,
        reclaimable: containersReclaimable,
      },
      volumes: {
        total: vols.length,
        active: vols.filter((v) => (v.UsageData?.RefCount ?? 0) > 0).length,
        size: volumesSize,
        reclaimable: volumesReclaimable,
      },
      buildCache: {
        total: bc.length,
        active: bc.filter((b) => b.InUse).length,
        size: buildCacheSize,
        reclaimable: buildCacheReclaimable,
      },
      totalSize,
      totalReclaimable,
    };
  });

  app.post("/system/prune", async () => {
    const docker = await currentDocker();
    const [containers, images, volumes, networks] = await Promise.all([
      docker.pruneContainers(),
      docker.pruneImages(),
      docker.pruneVolumes(),
      docker.pruneNetworks(),
    ]);
    return { containers, images, volumes, networks };
  });

  app.get<{ Querystring: { minutes?: string; limit?: string } }>(
    "/system/events",
    async (req) => {
      const minutes = Math.max(1, Math.min(60, Number(req.query.minutes ?? 5) || 5));
      const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50) || 50));
      const until = Math.floor(Date.now() / 1000);
      const since = until - minutes * 60;
      const docker = await currentDocker();
      const stream: NodeJS.ReadableStream = await docker.getEvents({ since, until });
      const events: any[] = [];
      let buffer = "";
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          let idx = buffer.indexOf("\n");
          while (idx !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (line) {
              try {
                events.push(JSON.parse(line));
              } catch {}
            }
            idx = buffer.indexOf("\n");
          }
        });
        stream.on("end", () => resolve());
        stream.on("close", () => resolve());
        stream.on("error", reject);
      });
      const normalized = events
        .map((e) => ({
          time: e.time ?? e.timeNano ? Math.floor((e.timeNano ?? e.time * 1e9) / 1e9) : 0,
          type: e.Type ?? e.type ?? "unknown",
          action: e.Action ?? e.status ?? "unknown",
          id: e.Actor?.ID ?? e.id,
          name: e.Actor?.Attributes?.name,
          image: e.Actor?.Attributes?.image ?? e.from,
        }))
        .filter((e) => e.time > 0)
        .sort((a, b) => b.time - a.time)
        .slice(0, limit);
      return normalized;
    },
  );
};
