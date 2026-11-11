import path from "node:path";

// Every Docker resource the suite creates carries this prefix, and cleanup only ever touches it.
export const E2E_PREFIX = "rihtim-e2e-";

export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3041);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 5181);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;

// The checkout under test. Defaults to this repo; point it at another worktree to test a branch
// with this suite without merging the suite into it.
export const APP_DIR = path.resolve(process.env.RIHTIM_APP_DIR ?? path.join(__dirname, ".."));
export const DESKTOP_DIR = path.join(APP_DIR, "apps", "desktop");

// Isolated API config (contexts, registries, scans) so tests never edit the user's ~/.rihtim.
export const DATA_DIR = path.join(__dirname, ".data");
export const ELECTRON_USER_DATA = path.join(__dirname, ".electron-user-data");
