import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Registry } from "@rihtim/shared";
import { config } from "../config.js";

interface Store {
  registries: Registry[];
}

const REGISTRIES_FILE = "registries.json";

const filePath = () => path.join(config.dataDir, REGISTRIES_FILE);

async function ensureDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readStore(): Promise<Store> {
  try {
    const buf = await fs.readFile(filePath(), "utf-8");
    const data = JSON.parse(buf) as Store;
    if (!data.registries) data.registries = [];
    return data;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { registries: [] };
    }
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath(), JSON.stringify(store, null, 2), "utf-8");
}

export const registryStore = {
  async list(): Promise<Registry[]> {
    const s = await readStore();
    return s.registries;
  },

  async get(id: string): Promise<Registry | undefined> {
    const list = await this.list();
    return list.find((r) => r.id === id);
  },

  async add(registry: Omit<Registry, "id">): Promise<Registry> {
    const store = await readStore();
    const created: Registry = { ...registry, id: randomUUID() };
    store.registries.push(created);
    await writeStore(store);
    return created;
  },

  async update(id: string, patch: Partial<Registry>): Promise<Registry> {
    const store = await readStore();
    const idx = store.registries.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("registry not found");
    store.registries[idx] = { ...store.registries[idx], ...patch, id };
    await writeStore(store);
    return store.registries[idx];
  },

  async remove(id: string): Promise<void> {
    const store = await readStore();
    const before = store.registries.length;
    store.registries = store.registries.filter((r) => r.id !== id);
    if (store.registries.length === before) throw new Error("registry not found");
    await writeStore(store);
  },
};
