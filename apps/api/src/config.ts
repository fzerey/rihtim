import path from "node:path";
import os from "node:os";

export const config = {
  port: Number(process.env.PORT ?? 5170),
  host: process.env.HOST ?? "127.0.0.1",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3030",
  dataDir:
    process.env.RIHTIM_DATA_DIR ??
    path.join(os.homedir(), ".rihtim"),
} as const;

export const CONTEXTS_FILE = "contexts.json";
