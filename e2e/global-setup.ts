import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { APP_DIR, DATA_DIR, ELECTRON_USER_DATA } from "./env";

export default function globalSetup() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(ELECTRON_USER_DATA, { recursive: true, force: true });
  // The desktop project launches the compiled main process, so make sure it is current.
  execSync(`pnpm -C "${APP_DIR}" --filter @rihtim/desktop run build:main`, { stdio: "inherit" });
}
