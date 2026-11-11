import { createRequire } from "node:module";
import path from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { API_PORT, DESKTOP_DIR, ELECTRON_USER_DATA, WEB_PORT } from "../env";

// Resolve the Electron binary from the desktop app under test, not from this package.
const electronPath = createRequire(path.join(DESKTOP_DIR, "package.json"))("electron") as unknown as string;

let app: ElectronApplication;
let win: Page;

test.beforeAll(async () => {
  const env = { ...process.env } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath,
    args: [DESKTOP_DIR, `--user-data-dir=${ELECTRON_USER_DATA}`],
    env: { ...env, RIHTIM_WEB_PORT: String(WEB_PORT), RIHTIM_API_PORT: String(API_PORT) },
  });
  win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  await win.evaluate(() => {
    localStorage.setItem("rihtim.locale", "en");
    localStorage.setItem("rihtim.theme", "dark");
  });
  await win.reload();
});

test.afterAll(async () => {
  // Closing the window only hides it to the tray; quit the app explicitly.
  await app?.evaluate(({ app }) => app.quit()).catch(() => {});
  await app?.close().catch(() => {});
});

test("desktop: window loads the dashboard through the bundled UI", async () => {
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
  expect(win.url()).toBe(`http://127.0.0.1:${WEB_PORT}/`);
  const bridge = await win.evaluate(() => {
    const r = (window as unknown as { rihtim?: { isDesktop?: boolean; versions?: { electron?: string } } }).rihtim;
    return { isDesktop: r?.isDesktop ?? false, electron: r?.versions?.electron ?? null };
  });
  expect(bridge.isDesktop).toBe(true);
  expect(bridge.electron).toMatch(/^\d+\.\d+\.\d+/);
});

test("desktop: window has the custom title bar", async () => {
  test.skip(process.platform === "darwin", "macOS keeps the native title bar");
  const overlay = await win.evaluate(() => {
    const wco = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay;
    const header = document.querySelector("header");
    return {
      visible: wco?.visible ?? false,
      dragRegion: header ? getComputedStyle(header).getPropertyValue("app-region") || getComputedStyle(header).getPropertyValue("-webkit-app-region") : null,
    };
  });
  expect(overlay.visible).toBe(true);
  expect(overlay.dragRegion).toBe("drag");
  const [width, height] = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
  expect(width).toBeGreaterThanOrEqual(1000);
  expect(height).toBeGreaterThanOrEqual(680);
});

test("desktop: theme change recolors the native window", async () => {
  test.skip(process.platform === "darwin", "macOS keeps the native title bar");
  const bg = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase());

  await win.getByRole("button", { name: "Theme" }).click();
  await win.getByRole("button", { name: "Light" }).click();
  await expect.poll(bg).toBe("#f5f7fa");

  await win.getByRole("button", { name: "Theme" }).click();
  await win.getByRole("button", { name: "Dark" }).click();
  await expect.poll(bg).toBe("#0f1115");
});

test("desktop: navigation works inside the app window", async () => {
  const nav = win.getByRole("navigation");
  await nav.getByRole("link", { name: "Containers", exact: true }).click();
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Containers");
  await nav.getByRole("link", { name: "Volumes", exact: true }).click();
  await expect(win.getByRole("heading", { level: 1 })).toHaveText("Volumes");
});
