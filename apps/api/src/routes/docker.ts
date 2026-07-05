import type { FastifyPluginAsync } from "fastify";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type Docker from "dockerode";
import { currentDocker } from "../contexts/docker-client.js";
import { registryStore } from "../registries/store.js";
import { scanStore } from "../images/scan-store.js";
import { demuxDockerLog } from "../util/demux.js";
import {
  ArchiveError,
  listArchiveDir,
  readArchiveFile,
  writeArchiveFile,
} from "../util/archive-fs.js";
import { contextStore } from "../contexts/store.js";
import { config } from "../config.js";
import type {
  ContainerSummary,
  DockerContext,
  ImageSummary,
  ImageHistoryEntry,
  ImageScanResult,
  ScanTarget,
  Vulnerability,
  VulnerabilitySeverity,
  VolumeSummary,
  NetworkSummary,
  BuildCacheEntry,
} from "@rihtim/shared";

// docker.df() is expensive on daemons with many images/containers; multiple
// routes (system/storage, build/cache, system/df) request it in parallel on
// each poll. A short in-memory TTL lets them share one Docker round-trip.
const DF_TTL_MS = 4000;
const dfCache = new WeakMap<Docker, { at: number; value: Promise<unknown> }>();
async function cachedDf(docker: Docker): Promise<any> {
  const now = Date.now();
  const entry = dfCache.get(docker);
  if (entry && now - entry.at < DF_TTL_MS) return entry.value;
  const value = docker.df().catch((err) => {
    dfCache.delete(docker);
    throw err;
  });
  dfCache.set(docker, { at: now, value });
  return value;
}

function hasRegistryPrefix(image: string): boolean {
  const first = image.split("/")[0] ?? "";
  return first.includes(".") || first.includes(":") || first === "localhost";
}

function buildRegistryImageReference(registryUrl: string, image: string): string {
  if (hasRegistryPrefix(image)) return image;
  const url = new URL(registryUrl);
  const basePath = url.pathname.replace(/^\/+|\/+$/g, "");
  const registryRoot = [url.host, basePath].filter(Boolean).join("/");
  return `${registryRoot}/${image}`;
}

function splitImageTag(ref: string): { repo: string; tag?: string } {
  const trimmed = ref.trim();
  const slash = trimmed.lastIndexOf("/");
  const colon = trimmed.lastIndexOf(":");
  if (colon > slash) {
    return {
      repo: trimmed.slice(0, colon),
      tag: trimmed.slice(colon + 1),
    };
  }
  return { repo: trimmed };
}

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";

type ComposeContainerInfo = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  service?: string;
};

type ComposeProjectInfo = {
  name: string;
  total: number;
  running: number;
  services: string[];
  containers: ComposeContainerInfo[];
};

async function resolveComposeFile(rawPath: string): Promise<string> {
  const file = path.resolve(rawPath);
  await fs.access(file);
  return file;
}

function sanitizeComposeFileName(name?: string): string {
  const base = (name ?? "docker-compose.yml").trim() || "docker-compose.yml";
  const onlyName = path.basename(base);
  const safe = onlyName.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (safe.endsWith(".yml") || safe.endsWith(".yaml")) return safe;
  return `${safe}.yml`;
}

async function prepareComposeInput(input: {
  filePath?: string;
  composeContent?: string;
  fileName?: string;
}): Promise<{ composeFile: string; cwd: string; cleanup: () => Promise<void> }> {
  if (input.filePath) {
    const composeFile = await resolveComposeFile(input.filePath);
    return {
      composeFile,
      cwd: path.dirname(composeFile),
      cleanup: async () => {},
    };
  }

  const content = input.composeContent;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("filePath or composeContent required");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rihtim-compose-"));
  const fileName = sanitizeComposeFileName(input.fileName);
  const composeFile = path.join(tempDir, fileName);
  await fs.writeFile(composeFile, content, "utf8");

  return {
    composeFile,
    cwd: tempDir,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function runDockerCompose(args: string[], cwd: string): Promise<{
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
}> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (d: Buffer) => stdoutChunks.push(d));
    child.stderr?.on("data", (d: Buffer) => stderrChunks.push(d));

    child.on("error", (err) => {
      resolve({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: err.message,
        command: ["docker", ...args].join(" "),
      });
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      resolve({
        ok: exitCode === 0,
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        command: ["docker", ...args].join(" "),
      });
    });
  });
}

export const containerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/containers", async (req) => {
    const all = (req.query as any)?.all !== "false";
    const docker = await currentDocker();
    const list = await docker.listContainers({ all });
    const mapped: ContainerSummary[] = list
      .filter((c) => !(c.Labels ?? {})[VOLUME_HELPER_LABEL])
      .map((c) => ({
      id: c.Id,
      names: c.Names,
      image: c.Image,
      imageId: c.ImageID,
      command: c.Command,
      createdAt: c.Created,
      state: c.State,
      status: c.Status,
      ports: (c.Ports ?? []).map((p) => ({
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
        const methods = container as unknown as Record<typeof action, () => Promise<unknown>>;
        await methods[action]();
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(400).send({ error: message });
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
    try {
      return await listArchiveDir(
        (p) => (container as any).getArchive({ path: p }),
        target,
        limit,
      );
    } catch (err) {
      if (err instanceof ArchiveError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
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
    try {
      return await readArchiveFile(
        (p) => (container as any).getArchive({ path: p }),
        target,
        maxBytes,
      );
    } catch (err) {
      if (err instanceof ArchiveError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Write/overwrite a single file via archive API.
  app.put<{
    Params: { id: string };
    Body: { path?: string; content?: string; encoding?: "utf-8" | "base64" };
  }>("/containers/:id/file", async (req, reply) => {
    const { path: target, content, encoding } = req.body ?? {};
    if (!target) return reply.code(400).send({ error: "path required" });
    if (typeof content !== "string") return reply.code(400).send({ error: "content required" });
    const buf = Buffer.from(content, encoding === "base64" ? "base64" : "utf-8");
    const docker = await currentDocker();
    const container = docker.getContainer(req.params.id);
    try {
      await writeArchiveFile(
        (stream, p) => (container as any).putArchive(stream, { path: p }),
        target,
        buf,
      );
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ArchiveError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
};

export const composeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/compose/projects", async () => {
    const docker = await currentDocker();
    const containers = await docker.listContainers({ all: true });
    const byProject = new Map<string, ComposeProjectInfo>();

    for (const c of containers) {
      const project = c.Labels?.[COMPOSE_PROJECT_LABEL];
      if (!project) continue;
      const service = c.Labels?.[COMPOSE_SERVICE_LABEL];
      let entry = byProject.get(project);
      if (!entry) {
        entry = {
          name: project,
          total: 0,
          running: 0,
          services: [],
          containers: [],
        };
        byProject.set(project, entry);
      }
      entry.total += 1;
      if (c.State === "running") entry.running += 1;
      if (service && !entry.services.includes(service)) entry.services.push(service);
      entry.containers.push({
        id: c.Id,
        name: (c.Names?.[0] ?? "").replace(/^\//, ""),
        image: c.Image,
        state: c.State,
        status: c.Status,
        service,
      });
    }

    return Array.from(byProject.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  app.post<{ Params: { name: string } }>("/compose/projects/:name/start", async (req) => {
    const docker = await currentDocker();
    const containers = await docker.listContainers({ all: true });
    const targets = containers.filter((c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === req.params.name);
    const changed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const c of targets) {
      if (c.State === "running" || c.State === "restarting" || c.State === "paused") continue;
      try {
        await docker.getContainer(c.Id).start();
        changed.push(c.Id);
      } catch (err) {
        failed.push({ id: c.Id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { ok: failed.length === 0, changed, failed };
  });

  app.post<{ Params: { name: string } }>("/compose/projects/:name/stop", async (req) => {
    const docker = await currentDocker();
    const containers = await docker.listContainers({ all: true });
    const targets = containers.filter((c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === req.params.name);
    const changed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const c of targets) {
      if (c.State !== "running") continue;
      try {
        await docker.getContainer(c.Id).stop();
        changed.push(c.Id);
      } catch (err) {
        failed.push({ id: c.Id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { ok: failed.length === 0, changed, failed };
  });

  app.post<{ Params: { name: string } }>("/compose/projects/:name/restart", async (req) => {
    const docker = await currentDocker();
    const containers = await docker.listContainers({ all: true });
    const targets = containers.filter((c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === req.params.name);
    const changed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const c of targets) {
      if (c.State !== "running") continue;
      try {
        await docker.getContainer(c.Id).restart();
        changed.push(c.Id);
      } catch (err) {
        failed.push({ id: c.Id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { ok: failed.length === 0, changed, failed };
  });

  app.delete<{ Params: { name: string }; Querystring: { volumes?: string } }>(
    "/compose/projects/:name",
    async (req) => {
      const docker = await currentDocker();
      const containers = await docker.listContainers({ all: true });
      const targets = containers.filter((c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === req.params.name);
      const changed: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const removeVolumes = req.query.volumes === "true";

      for (const c of targets) {
        try {
          await docker.getContainer(c.Id).remove({ force: true, v: removeVolumes });
          changed.push(c.Id);
        } catch (err) {
          failed.push({ id: c.Id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { ok: failed.length === 0, changed, failed };
    },
  );

  app.post<{
    Body: {
      filePath?: string;
      composeContent?: string;
      fileName?: string;
      projectName?: string;
      detach?: boolean;
    };
  }>(
    "/compose/cli/up",
    async (req, reply) => {
      let prepared: Awaited<ReturnType<typeof prepareComposeInput>>;
      try {
        prepared = await prepareComposeInput(req.body ?? {});
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid compose input";
        return reply.code(400).send({ error: message });
      }

      const args = ["compose", "-f", prepared.composeFile];
      if (req.body.projectName) args.push("-p", req.body.projectName);
      args.push("up");
      if (req.body.detach !== false) args.push("-d");

      try {
        const result = await runDockerCompose(args, prepared.cwd);
        if (!result.ok) return reply.code(400).send(result);
        return result;
      } finally {
        await prepared.cleanup();
      }
    },
  );

  app.post<{
    Body: {
      filePath?: string;
      composeContent?: string;
      fileName?: string;
      projectName?: string;
      volumes?: boolean;
      removeOrphans?: boolean;
    };
  }>(
    "/compose/cli/down",
    async (req, reply) => {
      let prepared: Awaited<ReturnType<typeof prepareComposeInput>>;
      try {
        prepared = await prepareComposeInput(req.body ?? {});
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid compose input";
        return reply.code(400).send({ error: message });
      }

      const args = ["compose", "-f", prepared.composeFile];
      if (req.body.projectName) args.push("-p", req.body.projectName);
      args.push("down");
      if (req.body.volumes) args.push("-v");
      if (req.body.removeOrphans) args.push("--remove-orphans");

      try {
        const result = await runDockerCompose(args, prepared.cwd);
        if (!result.ok) return reply.code(400).send(result);
        return result;
      } finally {
        await prepared.cleanup();
      }
    },
  );
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

  app.get<{ Params: { id: string } }>("/images/:id/history", async (req) => {
    const docker = await currentDocker();
    const history = (await docker.getImage(req.params.id).history()) as any[];
    const mapped: ImageHistoryEntry[] = history.map((h) => ({
      id: h.Id && h.Id !== "<missing>" ? h.Id : undefined,
      createdAt: h.Created,
      createdBy: h.CreatedBy ?? "",
      size: h.Size ?? 0,
      comment: h.Comment || undefined,
      tags: h.Tags ?? [],
    }));
    return mapped;
  });

  app.get<{ Params: { id: string } }>("/images/:id/scan", async (req, reply) => {
    const cached = await scanStore.get(req.params.id);
    if (!cached) return reply.code(204).send();
    return cached;
  });

  app.post<{ Params: { id: string } }>("/images/:id/scan", async (req, reply) => {
    const docker = await currentDocker();

    let imageRef = req.params.id;
    try {
      const info = (await docker.getImage(req.params.id).inspect()) as any;
      const tag = (info.RepoTags ?? []).find(
        (t: string) => t && t !== "<none>:<none>",
      );
      if (tag) imageRef = tag;
    } catch {
      // fall back to the raw id/reference
    }

    const TRIVY_IMAGE = "aquasec/trivy:latest";
    const CACHE_VOLUME = "rihtim-trivy-cache";

    // Ensure the Trivy scanner image is available.
    try {
      await docker.getImage(TRIVY_IMAGE).inspect();
    } catch {
      try {
        const stream = await docker.pull(TRIVY_IMAGE);
        await new Promise<void>((resolve, rejectPull) => {
          (docker as any).modem.followProgress(stream, (err: any) =>
            err ? rejectPull(err) : resolve(),
          );
        });
      } catch (err) {
        return reply.code(502).send({
          error: "scanner_unavailable",
          message: `Could not pull scanner image ${TRIVY_IMAGE}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }

    // A cache volume keeps the vulnerability DB between scans.
    try {
      await docker.getVolume(CACHE_VOLUME).inspect();
    } catch {
      try {
        await docker.createVolume({ Name: CACHE_VOLUME });
      } catch {
        // proceed without cache if volume creation fails
      }
    }

    let container: Docker.Container | undefined;
    try {
      container = await docker.createContainer({
        Image: TRIVY_IMAGE,
        Cmd: [
          "image",
          "--format",
          "json",
          "--quiet",
          "--scanners",
          "vuln",
          imageRef,
        ],
        HostConfig: {
          AutoRemove: false,
          Binds: [
            "/var/run/docker.sock:/var/run/docker.sock",
            `${CACHE_VOLUME}:/root/.cache/`,
          ],
        },
      });

      await container.start();
      const result = (await container.wait()) as { StatusCode?: number };

      const stdoutBuf = (await container.logs({
        follow: false,
        stdout: true,
        stderr: false,
      } as any)) as unknown as Buffer;
      const stderrBuf = (await container.logs({
        follow: false,
        stdout: false,
        stderr: true,
      } as any)) as unknown as Buffer;

      const stdout = demuxDockerLog(stdoutBuf).trim();
      const stderr = demuxDockerLog(stderrBuf).trim();

      if (!stdout) {
        return reply.code(500).send({
          error: "scan_failed",
          message: stderr || `Scanner exited with code ${result.StatusCode ?? "?"}`,
        });
      }

      let parsed: any;
      try {
        // Trivy emits a single JSON document; guard against leading noise.
        const start = stdout.indexOf("{");
        parsed = JSON.parse(start >= 0 ? stdout.slice(start) : stdout);
      } catch {
        return reply.code(500).send({
          error: "scan_parse_failed",
          message: stderr || "Could not parse scanner output.",
        });
      }

      const summary: Record<VulnerabilitySeverity, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        UNKNOWN: 0,
      };
      const targets: ScanTarget[] = [];
      let total = 0;

      for (const res of parsed.Results ?? []) {
        const vulns: Vulnerability[] = (res.Vulnerabilities ?? []).map((v: any) => {
          const sev = (String(v.Severity ?? "UNKNOWN").toUpperCase() as VulnerabilitySeverity);
          const severity: VulnerabilitySeverity =
            sev in summary ? sev : "UNKNOWN";
          summary[severity] += 1;
          total += 1;
          return {
            vulnerabilityId: v.VulnerabilityID ?? "",
            pkgName: v.PkgName ?? "",
            installedVersion: v.InstalledVersion ?? "",
            fixedVersion: v.FixedVersion || undefined,
            severity,
            title: v.Title || undefined,
            primaryUrl: v.PrimaryURL || undefined,
          };
        });
        targets.push({
          target: res.Target ?? "",
          type: res.Type || undefined,
          vulnerabilities: vulns,
        });
      }

      const scan: ImageScanResult = {
        imageRef,
        scannedAt: Math.floor(Date.now() / 1000),
        summary,
        total,
        targets,
      };
      await scanStore.set(req.params.id, scan);
      return scan;
    } catch (err) {
      return reply.code(500).send({
        error: "scan_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (container) {
        try {
          await container.remove({ force: true });
        } catch {
          // best-effort cleanup
        }
      }
    }
  });

  app.post<{ Body: { fromImage: string; tag?: string; registryId?: string } }>("/images/pull", async (req, reply) => {
    const docker = await currentDocker();
    const { fromImage, tag, registryId } = req.body ?? { fromImage: "" };
    if (!fromImage) return reply.code(400).send({ error: "fromImage required" });

    let imageRef = fromImage;
    let authconfig:
      | {
          username?: string;
          password?: string;
          serveraddress?: string;
        }
      | undefined;

    if (registryId) {
      const registry = await registryStore.get(registryId);
      if (!registry) return reply.code(404).send({ error: "registry not found" });
      imageRef = buildRegistryImageReference(registry.url, fromImage);
      if (registry.username || registry.password) {
        authconfig = {
          username: registry.username,
          password: registry.password,
          serveraddress: registry.url,
        };
      }
    }

    const stream = await docker.pull(tag ? `${imageRef}:${tag}` : imageRef, authconfig ? { authconfig } : undefined);
    reply.raw.setHeader("Content-Type", "application/x-ndjson");
    stream.pipe(reply.raw);
    return reply;
  });

  app.post<{
    Body: {
      sourceImage: string;
      targetImage: string;
      targetTag?: string;
      registryId: string;
    };
  }>("/images/push", async (req, reply) => {
    const docker = await currentDocker();
    const { sourceImage, targetImage, targetTag, registryId } = req.body ?? ({} as any);
    if (!sourceImage) return reply.code(400).send({ error: "sourceImage required" });
    if (!targetImage) return reply.code(400).send({ error: "targetImage required" });
    if (!registryId) return reply.code(400).send({ error: "registryId required" });

    const registry = await registryStore.get(registryId);
    if (!registry) return reply.code(404).send({ error: "registry not found" });

    const remoteRef = buildRegistryImageReference(registry.url, targetImage);
    const parsed = splitImageTag(remoteRef);
    const finalTag = (targetTag && targetTag.trim()) || parsed.tag || "latest";

    try {
      await docker.getImage(sourceImage).tag({ repo: parsed.repo, tag: finalTag });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "failed to tag source image",
      });
    }

    const imageRef = `${parsed.repo}:${finalTag}`;
    const pushOpts =
      registry.username || registry.password
        ? {
            authconfig: {
              username: registry.username,
              password: registry.password,
              serveraddress: registry.url,
            },
          }
        : undefined;

    let stream: NodeJS.ReadableStream;
    try {
      stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        (docker.getImage(imageRef) as any).push(pushOpts ?? {}, (err: Error | null, s: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          resolve(s);
        });
      });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "push start failed",
      });
    }

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
      await scanStore.remove(req.params.id);
      return reply.code(204).send();
    },
  );

  app.post("/images/prune", async () => {
    const docker = await currentDocker();
    return docker.pruneImages({ filters: { dangling: { false: true } } as any });
  });
};

// Volume file browsing needs a helper container that mounts the volume, since
// the Docker API exposes no direct filesystem access for volumes. We reuse a
// long-lived (labeled) helper per volume and clean it up when the UI closes.
const VOLUME_HELPER_IMAGE = "busybox:latest";
const VOLUME_HELPER_LABEL = "com.rihtim.volume-helper";
const VOLUME_MOUNT = "/mnt/vol";

function toHelperPath(volPath: string): string {
  if (!volPath || volPath === "/") return VOLUME_MOUNT;
  const clean = volPath.startsWith("/") ? volPath : `/${volPath}`;
  return VOLUME_MOUNT + clean;
}

function fromHelperPath(helperPath: string): string {
  if (helperPath === VOLUME_MOUNT) return "/";
  if (helperPath.startsWith(`${VOLUME_MOUNT}/`)) return helperPath.slice(VOLUME_MOUNT.length);
  return helperPath;
}

async function ensureVolumeHelper(
  docker: Docker,
  volumeName: string,
): Promise<Docker.Container> {
  const existing = await docker.listContainers({
    all: true,
    filters: { label: [`${VOLUME_HELPER_LABEL}=${volumeName}`] } as any,
  });
  if (existing.length > 0) {
    const c = docker.getContainer(existing[0].Id);
    if (existing[0].State !== "running") {
      try {
        await c.start();
      } catch {
        // container may already be running; ignore
      }
    }
    return c;
  }

  try {
    await docker.getImage(VOLUME_HELPER_IMAGE).inspect();
  } catch {
    const stream = await docker.pull(VOLUME_HELPER_IMAGE);
    await new Promise<void>((resolve, reject) => {
      (docker as any).modem.followProgress(stream, (err: any) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  const container = await docker.createContainer({
    Image: VOLUME_HELPER_IMAGE,
    Cmd: ["sleep", "2147483647"],
    Labels: { [VOLUME_HELPER_LABEL]: volumeName, "com.rihtim.managed": "true" },
    HostConfig: {
      Binds: [`${volumeName}:${VOLUME_MOUNT}`],
      AutoRemove: false,
    },
  });
  await container.start();
  return container;
}

async function removeVolumeHelper(docker: Docker, volumeName: string): Promise<void> {
  const existing = await docker.listContainers({
    all: true,
    filters: { label: [`${VOLUME_HELPER_LABEL}=${volumeName}`] } as any,
  });
  await Promise.all(
    existing.map((c) =>
      docker
        .getContainer(c.Id)
        .remove({ force: true })
        .catch(() => undefined),
    ),
  );
}

export const volumeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/volumes", async () => {
    const docker = await currentDocker();
    const [res, df] = await Promise.all([
      docker.listVolumes(),
      cachedDf(docker).catch(() => null),
    ]);
    const usage = new Map<string, { size?: number; refCount?: number }>();
    if (df && Array.isArray(df.Volumes)) {
      for (const v of df.Volumes) {
        if (v.UsageData) {
          usage.set(v.Name, {
            size: v.UsageData.Size,
            refCount: v.UsageData.RefCount,
          });
        }
      }
    }
    const mapped: VolumeSummary[] = (res.Volumes ?? []).map((v: any) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      createdAt: v.CreatedAt,
      labels: v.Labels ?? {},
      scope: v.Scope,
      size: usage.get(v.Name)?.size,
      refCount: usage.get(v.Name)?.refCount,
    }));
    return mapped;
  });

  app.post<{ Body: any }>("/volumes", async (req) => {
    const docker = await currentDocker();
    return docker.createVolume(req.body as any);
  });

  app.get<{ Params: { name: string } }>("/volumes/:name", async (req) => {
    const docker = await currentDocker();
    return docker.getVolume(req.params.name).inspect();
  });

  // List files inside a volume (via a helper container that mounts it).
  app.get<{
    Params: { name: string };
    Querystring: { path?: string; limit?: string };
  }>("/volumes/:name/fs", async (req, reply) => {
    const volPath = req.query.path && req.query.path.length > 0 ? req.query.path : "/";
    const limit = Math.max(1, Math.min(Number(req.query.limit ?? 2000), 20000));
    const docker = await currentDocker();
    try {
      const helper = await ensureVolumeHelper(docker, req.params.name);
      const listing = await listArchiveDir(
        (p) => (helper as any).getArchive({ path: p }),
        toHelperPath(volPath),
        limit,
      );
      return { ...listing, path: fromHelperPath(listing.path) };
    } catch (err) {
      if (err instanceof ArchiveError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Read a single file from a volume.
  app.get<{
    Params: { name: string };
    Querystring: { path?: string; max?: string };
  }>("/volumes/:name/file", async (req, reply) => {
    const volPath = req.query.path;
    if (!volPath) return reply.code(400).send({ error: "path required" });
    const maxBytes = Math.max(1024, Math.min(Number(req.query.max ?? 1_048_576), 16_777_216));
    const docker = await currentDocker();
    try {
      const helper = await ensureVolumeHelper(docker, req.params.name);
      const file = await readArchiveFile(
        (p) => (helper as any).getArchive({ path: p }),
        toHelperPath(volPath),
        maxBytes,
      );
      return { ...file, path: fromHelperPath(file.path) };
    } catch (err) {
      if (err instanceof ArchiveError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Write/overwrite a single file in a volume.
  app.put<{
    Params: { name: string };
    Body: { path?: string; content?: string; encoding?: "utf-8" | "base64" };
  }>("/volumes/:name/file", async (req, reply) => {
    const { path: volPath, content, encoding } = req.body ?? {};
    if (!volPath) return reply.code(400).send({ error: "path required" });
    if (typeof content !== "string") return reply.code(400).send({ error: "content required" });
    const buf = Buffer.from(content, encoding === "base64" ? "base64" : "utf-8");
    const docker = await currentDocker();
    try {
      const helper = await ensureVolumeHelper(docker, req.params.name);
      await writeArchiveFile(
        (stream, p) => (helper as any).putArchive(stream, { path: p }),
        toHelperPath(volPath),
        buf,
      );
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ArchiveError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Tear down the volume's helper container (called when the browser closes).
  app.delete<{ Params: { name: string } }>("/volumes/:name/helper", async (req, reply) => {
    const docker = await currentDocker();
    await removeVolumeHelper(docker, req.params.name);
    return reply.code(204).send();
  });

  app.delete<{ Params: { name: string }; Querystring: { force?: string } }>(
    "/volumes/:name",
    async (req, reply) => {
      const docker = await currentDocker();
      await removeVolumeHelper(docker, req.params.name).catch(() => undefined);
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
  type DiagnosticFix = {
    id: string;
    kind: "auto" | "command";
    label: string;
    description: string;
    command?: string;
  };

  type DiagnosticCheck = {
    id: string;
    label: string;
    ok: boolean;
    message: string;
    fixes?: DiagnosticFix[];
  };

  function recommendedDockerStartCommand(): string | null {
    if (process.platform === "win32") return "Start-Service com.docker.service";
    if (process.platform === "darwin") return "open -a Docker";
    if (process.platform === "linux") return "sudo systemctl start docker";
    return null;
  }

  function defaultContextDraft(): Omit<DockerContext, "id"> {
    if (process.platform === "win32") {
      return {
        name: "local (npipe)",
        kind: "npipe",
        socketPath: "//./pipe/docker_engine",
        current: true,
      };
    }
    return {
      name: "local (socket)",
      kind: "socket",
      socketPath: "/var/run/docker.sock",
      current: true,
    };
  }

  async function collectDiagnostics(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    try {
      const contexts = await contextStore.list();
      const current = contexts.find((c) => c.current) ?? contexts[0];
      const hasContexts = contexts.length > 0;
      checks.push({
        id: "contexts",
        label: "Context store",
        ok: hasContexts,
        message: hasContexts
          ? `${contexts.length} context(s), active: ${current?.name ?? "unknown"}`
          : "No Docker context configured",
        fixes: hasContexts
          ? undefined
          : [
              {
                id: "diag-contexts-bootstrap",
                kind: "auto",
                label: "Create default context",
                description: "Add a local Docker context and mark it as active.",
              },
            ],
      });
    } catch (err) {
      checks.push({
        id: "contexts",
        label: "Context store",
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        fixes: [
          {
            id: "diag-contexts-bootstrap",
            kind: "auto",
            label: "Create default context",
            description: "Attempt to rebuild the local context store file.",
          },
        ],
      });
    }

    try {
      await fs.mkdir(config.dataDir, { recursive: true });
      const p = path.join(config.dataDir, ".rihtim-diag.tmp");
      await fs.writeFile(p, "ok", "utf8");
      await fs.unlink(p);
      checks.push({
        id: "fs",
        label: "Filesystem",
        ok: true,
        message: "Read/write access is available",
      });
    } catch (err) {
      checks.push({
        id: "fs",
        label: "Filesystem",
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        fixes: [
          {
            id: "diag-fs-ensure-data-dir",
            kind: "auto",
            label: "Recreate app data directory",
            description: `Ensure ${config.dataDir} exists and is writable.`,
          },
        ],
      });
    }

    try {
      const docker = await currentDocker();
      await docker.ping();
      const version = await docker.version();
      checks.push({
        id: "docker",
        label: "Docker daemon",
        ok: true,
        message: `Reachable (Docker ${version.Version ?? "unknown"}, API ${version.ApiVersion ?? "?"})`,
      });

      const containers = await docker.listContainers({ all: true });
      const composeProjects = new Set(
        containers
          .map((c) => c.Labels?.[COMPOSE_PROJECT_LABEL])
          .filter((v): v is string => Boolean(v)),
      );
      checks.push({
        id: "compose-discovery",
        label: "Compose discovery",
        ok: true,
        message: `${composeProjects.size} Compose project(s) detected`,
      });
    } catch (err) {
      const startCmd = recommendedDockerStartCommand();
      checks.push({
        id: "docker",
        label: "Docker daemon",
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        fixes: startCmd
          ? [
              {
                id: "diag-docker-start-command",
                kind: "command",
                label: "Start Docker daemon",
                description: "Run the suggested system command, then rerun checks.",
                command: startCmd,
              },
            ]
          : undefined,
      });
      checks.push({
        id: "compose-discovery",
        label: "Compose discovery",
        ok: false,
        message: "Skipped because Docker is unreachable",
      });
    }

    checks.push({
      id: "runtime",
      label: "Runtime",
      ok: true,
      message: `${process.platform} / Node ${process.version}`,
    });

    return checks;
  }

  async function runDiagnosticFix(fixId: string): Promise<string> {
    switch (fixId) {
      case "diag-contexts-bootstrap": {
        const contexts = await contextStore.list();
        if (contexts.length === 0) {
          await contextStore.add(defaultContextDraft());
          return "Default Docker context created.";
        }
        const current = contexts.find((c) => c.current);
        if (!current && contexts[0]) {
          await contextStore.setCurrent(contexts[0].id);
          return "Current Docker context restored.";
        }
        return "Context store is already healthy.";
      }
      case "diag-fs-ensure-data-dir":
        await fs.mkdir(config.dataDir, { recursive: true });
        return `Data directory ensured at ${config.dataDir}.`;
      case "diag-docker-start-command":
        throw new Error("This fix is command-only. Copy and run the suggested command.");
      default:
        throw new Error("Unknown fix id");
    }
  }

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
    return cachedDf(docker);
  });

  app.get("/system/storage", async () => {
    const docker = await currentDocker();
    const df: any = await cachedDf(docker);
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
              } catch {
                // skip malformed event line
              }
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

  app.get("/system/diagnostics", async () => {
    const checks = await collectDiagnostics();

    return {
      ok: checks.every((c) => c.ok),
      generatedAt: new Date().toISOString(),
      checks,
    };
  });

  app.post<{ Body: { fixId?: string } }>("/system/diagnostics/fix", async (req, reply) => {
    const fixId = req.body?.fixId;
    if (!fixId) return reply.code(400).send({ error: "fixId required" });
    try {
      const message = await runDiagnosticFix(fixId);
      return { ok: true, fixId, message };
    } catch (err) {
      return reply
        .code(400)
        .send({ ok: false, fixId, error: err instanceof Error ? err.message : String(err) });
    }
  });
};

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  ".venv",
  "__pycache__",
]);

async function collectContextFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, rel: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, relPath);
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  }
  await walk(root, "");
  return files;
}

export const buildRoutes: FastifyPluginAsync = async (app) => {
  app.get("/build/cache", async () => {
    const docker = await currentDocker();
    const df: any = await cachedDf(docker);
    const bc: any[] = df.BuildCache ?? [];
    const mapped: BuildCacheEntry[] = bc.map((b) => {
      const created = b.CreatedAt ? Date.parse(b.CreatedAt) : NaN;
      const lastUsed = b.LastUsedAt ? Date.parse(b.LastUsedAt) : NaN;
      return {
        id: b.ID ?? "",
        parents: Array.isArray(b.Parents) ? b.Parents : b.Parent ? [b.Parent] : [],
        type: b.Type ?? "",
        description: b.Description ?? "",
        inUse: !!b.InUse,
        shared: !!b.Shared,
        size: b.Size ?? 0,
        createdAt: Number.isFinite(created) ? Math.floor(created / 1000) : 0,
        lastUsedAt: Number.isFinite(lastUsed) ? Math.floor(lastUsed / 1000) : undefined,
        usageCount: b.UsageCount ?? 0,
      };
    });
    return mapped;
  });

  app.post<{ Querystring: { all?: string } }>("/build/prune", async (req, reply) => {
    const docker = await currentDocker();
    const all = req.query.all === "true";
    const result: any = await new Promise((resolve, reject) => {
      (docker as any).modem.dial(
        {
          path: `/build/prune?all=${all ? "1" : "0"}&keep-storage=0`,
          method: "POST",
          statusCodes: { 200: true, 500: "server error" },
        },
        (err: any, data: any) => (err ? reject(err) : resolve(data)),
      );
    });
    return reply.send({
      spaceReclaimed: result?.SpaceReclaimed ?? 0,
      cachesDeleted: result?.CachesDeleted ?? [],
    });
  });

  app.post<{
    Body: {
      contextPath: string;
      dockerfile?: string;
      tag: string;
      noCache?: boolean;
      pull?: boolean;
      buildArgs?: Record<string, string>;
    };
  }>("/build", async (req, reply) => {
    const { contextPath, dockerfile, tag, noCache, pull, buildArgs } = req.body ?? ({} as any);
    if (!contextPath || !tag) {
      return reply.code(400).send({ error: "contextPath and tag are required" });
    }
    let stat;
    try {
      stat = await fs.stat(contextPath);
    } catch (err: any) {
      return reply.code(400).send({ error: "context_not_found", message: err.message });
    }
    if (!stat.isDirectory()) {
      return reply.code(400).send({ error: "context_not_directory" });
    }
    const dfName = dockerfile && dockerfile.length > 0 ? dockerfile : "Dockerfile";
    try {
      await fs.access(path.join(contextPath, dfName));
    } catch {
      return reply.code(400).send({ error: "dockerfile_not_found", message: dfName });
    }

    const files = await collectContextFiles(contextPath);
    if (!files.includes(dfName)) files.push(dfName);

    const docker = await currentDocker();
    const options: any = {
      t: tag,
      dockerfile: dfName,
      nocache: !!noCache,
      pull: pull ? "true" : undefined,
      buildargs: buildArgs && Object.keys(buildArgs).length > 0 ? buildArgs : undefined,
    };
    const stream = await docker.buildImage(
      { context: contextPath, src: files },
      options,
    );
    reply.raw.setHeader("Content-Type", "application/x-ndjson");
    (stream as any).pipe(reply.raw);
    return reply;
  });
};
