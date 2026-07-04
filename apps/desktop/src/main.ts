import { app, BrowserWindow, Menu, Tray, nativeImage, shell, utilityProcess } from "electron";
import path from "node:path";
import net from "node:net";
import fs from "node:fs";

const WEB_PORT = Number(process.env.RIHTIM_WEB_PORT ?? 3030);
const API_PORT = Number(process.env.RIHTIM_API_PORT ?? 5170);
const HOST = "127.0.0.1";
const WEB_URL = `http://${HOST}:${WEB_PORT}`;

type ForkedProcess = ReturnType<typeof utilityProcess.fork>;

let apiProc: ForkedProcess | null = null;
let webProc: ForkedProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let logFile = "";
let logStream: fs.WriteStream | null = null;

/** Append a line to the on-disk log (and console). */
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    console.log(line);
  } catch {
    /* no console in a packaged GUI process */
  }
  logStream?.write(`${line}\n`);
}

/** Create the log file under the per-user logs directory. */
function initLogger(): void {
  try {
    const dir = app.getPath("logs");
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, "rihtim-main.log");
    logStream = fs.createWriteStream(logFile, { flags: "a" });
  } catch (err) {
    console.error("failed to init logger:", err);
  }
  log("──────────────────────────────────────────");
  log(`Rihtim starting (packaged=${app.isPackaged}, platform=${process.platform})`);
  log(`resourcesPath=${process.resourcesPath}`);
  log(`logFile=${logFile}`);
}

/** Absolute path to a file inside the packaged `resources` directory. */
function resource(...parts: string[]): string {
  return path.join(process.resourcesPath, ...parts);
}

/** Resolve when a TCP port starts accepting connections, or reject on timeout. */
function waitForPort(port: number, timeoutMs = 45_000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: HOST, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${HOST}:${port}`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

/** Resolve true if something is already listening on the port. */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Fork a bundled Node server and stream its output to the log. */
function forkServer(
  name: string,
  entry: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): ForkedProcess {
  log(`starting ${name}: ${entry} (exists=${fs.existsSync(entry)}, cwd=${cwd})`);
  const child = utilityProcess.fork(entry, [], { serviceName: name, stdio: "pipe", cwd, env });
  child.stdout?.on("data", (d: Buffer) => log(`[${name}] ${d.toString().trimEnd()}`));
  child.stderr?.on("data", (d: Buffer) => log(`[${name}:err] ${d.toString().trimEnd()}`));
  child.on("spawn", () => log(`[${name}] spawned (pid=${child.pid})`));
  child.on("exit", (code) => log(`[${name}] exited with code=${code}`));
  return child;
}

/** Spawn the bundled API and Next.js servers using Electron's built-in Node. */
async function startBackends(): Promise<void> {
  if (await isPortInUse(API_PORT)) {
    log(`API port ${API_PORT} already in use — reusing existing server`);
  } else {
    apiProc = forkServer("rihtim-api", resource("server", "dist", "server.js"), resource("server"), {
      ...process.env,
      NODE_ENV: "production",
      HOST,
      PORT: String(API_PORT),
      CORS_ORIGIN: WEB_URL,
    });
  }

  if (await isPortInUse(WEB_PORT)) {
    log(`Web port ${WEB_PORT} already in use — reusing existing server`);
  } else {
    const webDir = resource("web", "apps", "web");
    webProc = forkServer("rihtim-web", path.join(webDir, "server.js"), webDir, {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: HOST,
      PORT: String(WEB_PORT),
      NEXT_PUBLIC_API_URL: `http://${HOST}:${API_PORT}`,
    });
  }
}

function stopBackends(): void {
  apiProc?.kill();
  webProc?.kill();
  apiProc = null;
  webProc = null;
}

/** Minimal HTML shown when the bundled web server fails to come up. */
function errorPage(message: string): string {
  const body = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:0 24px;color:#e2e8f0">
      <h1 style="font-size:20px">Rihtim couldn't start its interface</h1>
      <p style="color:#94a3b8">${message}</p>
      <p style="color:#94a3b8">Log file:<br><code style="color:#cbd5e1">${logFile}</code></p>
    </div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html><body style="background:#0b0f14;margin:0">${body}</body></html>`,
  )}`;
}

/** Bring the main window to the foreground, recreating it if needed. */
function showMainWindow(): void {
  if (!mainWindow) {
    void createWindow(true);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Show the window and navigate it to a specific in-app path (e.g. "/settings"). */
function openAppPath(pathname: string): void {
  const url = `${WEB_URL}${pathname}`;
  if (!mainWindow) {
    void createWindow(true).then(() => mainWindow?.loadURL(url));
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  void mainWindow.loadURL(url);
}

/** Create the system-tray icon so the app keeps running when its window is closed. */
function createTray(): void {
  if (tray) return;
  let image = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  if (!image.isEmpty()) {
    image = image.resize({ width: 16, height: 16 });
  } else {
    log("tray icon not found — using an empty image");
  }
  try {
    tray = new Tray(image);
  } catch (err) {
    log(`failed to create tray: ${String(err)}`);
    return;
  }
  tray.setToolTip("Rihtim");
  const menu = Menu.buildFromTemplate([
    { label: "Open Panel", click: () => showMainWindow() },
    { label: "Containers", click: () => openAppPath("/containers") },
    { label: "Images", click: () => openAppPath("/images") },
    { label: "Settings", click: () => openAppPath("/settings") },
    { type: "separator" },
    {
      label: "Quit Rihtim",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
}

async function createWindow(webReady: boolean): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Always reveal the window so the app never appears "stuck in background".
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  }, 2_000);

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    log(`did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    log(`render-process-gone reason=${details.reason}`);
  });

  // Open target="_blank" / external links in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(WEB_URL)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    // Closing the window keeps the app alive in the tray unless we're quitting.
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (webReady) {
    log(`loading ${WEB_URL}`);
    await mainWindow.loadURL(WEB_URL);
  } else {
    log("web server not ready — showing error page");
    await mainWindow.loadURL(errorPage("The bundled web server did not start in time."));
  }
}

async function bootstrap(): Promise<void> {
  initLogger();
  Menu.setApplicationMenu(null);

  // When packaged we launch the bundled servers ourselves. In development we
  // assume `pnpm dev` is already serving the web (3030) and API (5170) apps.
  if (app.isPackaged) {
    try {
      await startBackends();
    } catch (err) {
      log(`startBackends failed: ${String(err)}`);
    }
  }

  let webReady = true;
  try {
    await waitForPort(WEB_PORT);
    log(`web port ${WEB_PORT} is up`);
  } catch (err) {
    webReady = false;
    log(`web server did not come up: ${String(err)}`);
  }

  await createWindow(webReady);
  createTray();
}

process.on("uncaughtException", (err) => log(`uncaughtException: ${err?.stack ?? String(err)}`));
process.on("unhandledRejection", (reason) => log(`unhandledRejection: ${String(reason)}`));

// Ensure only a single instance runs; a second launch focuses the existing one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      void createWindow(true);
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    log(`fatal: ${String(err)}`);
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow(true);
  }
});

app.on("window-all-closed", () => {
  // Keep the app alive in the system tray; quit only via the tray menu
  // (or the platform quit shortcut, which triggers before-quit).
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("before-quit", stopBackends);
app.on("will-quit", stopBackends);
