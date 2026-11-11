import { defineConfig } from "@playwright/test";
import { API_PORT, API_URL, APP_DIR, DATA_DIR, WEB_PORT, WEB_URL } from "./env";

const pnpm = `pnpm -C "${APP_DIR}"`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Tests share one Docker engine and one API instance, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "web",
      testIgnore: /desktop\.spec\.ts/,
      // Uses the installed Edge on Windows so no browser download is needed locally.
      use: { channel: process.platform === "win32" ? "msedge" : undefined },
    },
    {
      name: "desktop",
      testMatch: /desktop\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `${pnpm} --filter @rihtim/api exec tsx src/server.ts`,
      url: `${API_URL}/health`,
      env: {
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
        CORS_ORIGIN: WEB_URL,
        RIHTIM_DATA_DIR: DATA_DIR,
        RIHTIM_RATE_LIMIT: "off",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `${pnpm} --filter @rihtim/web run build && ${pnpm} --filter @rihtim/web exec next start -p ${WEB_PORT}`,
      url: WEB_URL,
      // Next 16 keeps `next dev` output under .next/dev, so this build does not disturb a dev server.
      env: { NEXT_PUBLIC_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
