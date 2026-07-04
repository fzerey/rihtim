import { promises as fs } from "node:fs";
import path from "node:path";
import type { ImageScanResult } from "@rihtim/shared";
import { config } from "../config.js";

interface Store {
  scans: Record<string, ImageScanResult>;
}

const SCANS_FILE = "scans.json";

const filePath = () => path.join(config.dataDir, SCANS_FILE);

async function ensureDir() {
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function readStore(): Promise<Store> {
  try {
    const buf = await fs.readFile(filePath(), "utf-8");
    const data = JSON.parse(buf) as Store;
    if (!data.scans) data.scans = {};
    return data;
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { scans: {} };
    }
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath(), JSON.stringify(store, null, 2), "utf-8");
}

export const scanStore = {
  async get(imageId: string): Promise<ImageScanResult | undefined> {
    const s = await readStore();
    return s.scans[imageId];
  },

  async set(imageId: string, result: ImageScanResult): Promise<void> {
    const store = await readStore();
    store.scans[imageId] = result;
    await writeStore(store);
  },

  async remove(imageId: string): Promise<void> {
    const store = await readStore();
    if (store.scans[imageId]) {
      delete store.scans[imageId];
      await writeStore(store);
    }
  },
};
