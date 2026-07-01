import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DockerContext } from "@rihtim/shared";
import { config, CONTEXTS_FILE } from "../config.js";

interface Store {
  contexts: DockerContext[];
  currentId?: string;
}

const filePath = () => path.join(config.dataDir, CONTEXTS_FILE);

async function ensureDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readStore(): Promise<Store> {
  try {
    const buf = await fs.readFile(filePath(), "utf-8");
    const data = JSON.parse(buf) as Store;
    if (!data.contexts) data.contexts = [];
    return data;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { contexts: defaultContexts() };
    }
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath(), JSON.stringify(store, null, 2), "utf-8");
}

function defaultContexts(): DockerContext[] {
  const isWin = process.platform === "win32";
  const local: DockerContext = isWin
    ? {
        id: randomUUID(),
        name: "local (npipe)",
        kind: "npipe",
        socketPath: "//./pipe/docker_engine",
        current: true,
      }
    : {
        id: randomUUID(),
        name: "local (socket)",
        kind: "socket",
        socketPath: "/var/run/docker.sock",
        current: true,
      };
  return [local];
}

export const contextStore = {
  async list(): Promise<DockerContext[]> {
    const s = await readStore();
    if (!s.contexts.some((c) => c.current) && s.contexts[0]) {
      s.contexts[0].current = true;
      await writeStore(s);
    }
    return s.contexts;
  },

  async current(): Promise<DockerContext> {
    const list = await this.list();
    const cur = list.find((c) => c.current) ?? list[0];
    if (!cur) throw new Error("No Docker context configured");
    return cur;
  },

  async get(id: string): Promise<DockerContext | undefined> {
    const list = await this.list();
    return list.find((c) => c.id === id);
  },

  async add(ctx: Omit<DockerContext, "id">): Promise<DockerContext> {
    const store = await readStore();
    const created: DockerContext = { ...ctx, id: randomUUID() };
    if (created.current) {
      store.contexts.forEach((c) => (c.current = false));
    }
    store.contexts.push(created);
    await writeStore(store);
    return created;
  },

  async update(id: string, patch: Partial<DockerContext>): Promise<DockerContext> {
    const store = await readStore();
    const idx = store.contexts.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("context not found");
    store.contexts[idx] = { ...store.contexts[idx], ...patch, id };
    if (patch.current) {
      store.contexts.forEach((c, i) => {
        if (i !== idx) c.current = false;
      });
    }
    await writeStore(store);
    return store.contexts[idx];
  },

  async remove(id: string): Promise<void> {
    const store = await readStore();
    const before = store.contexts.length;
    store.contexts = store.contexts.filter((c) => c.id !== id);
    if (store.contexts.length === before) throw new Error("context not found");
    if (!store.contexts.some((c) => c.current) && store.contexts[0]) {
      store.contexts[0].current = true;
    }
    await writeStore(store);
  },

  async setCurrent(id: string): Promise<DockerContext> {
    const store = await readStore();
    let found: DockerContext | undefined;
    for (const c of store.contexts) {
      c.current = c.id === id;
      if (c.current) found = c;
    }
    if (!found) throw new Error("context not found");
    await writeStore(store);
    return found;
  },
};
