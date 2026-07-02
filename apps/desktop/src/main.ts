import { app, BrowserWindow, Menu, shell, utilityProcess } from "electron";
import path from "node:path";
import net from "node:net";

const WEB_PORT = Number(process.env.RIHTIM_WEB_PORT ?? 3030);
const API_PORT = Number(process.env.RIHTIM_API_PORT ?? 5170);
const HOST = "127.0.0.1";
const WEB_URL = `http://${HOST}:${WEB_PORT}`;

type ForkedProcess = ReturnType<typeof utilityProcess.fork>;

let apiProc: ForkedProcess | null = null;
let webProc: ForkedProcess | null = null;
let mainWindow: BrowserWindow | null = null;

/** Absolute path to a file inside the packaged `resources` directory. */
function resource(...parts: string[]): string {
  return path.join(process.resourcesPath, ...parts);
}

/** Resolve when a TCP port starts accepting connections, or reject on timeout. */
function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
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

/** Spawn the bundled API and Next.js servers using Electron's built-in Node. */
async function startBackends(): Promise<void> {
  // Reuse a server left over from a previous (possibly crashed) session
  // instead of failing to bind and leaving the app unusable on reopen.
  if (!(await isPortInUse(API_PORT))) {
    apiProc = utilityProcess.fork(resource("server", "dist", "server.js"), [], {
      serviceName: "rihtim-api",
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST,
        PORT: String(API_PORT),
        CORS_ORIGIN: WEB_URL,
      },
    });
  }

  if (!(await isPortInUse(WEB_PORT))) {
    const webDir = resource("web", "apps", "web");
    webProc = utilityProcess.fork(path.join(webDir, "server.js"), [], {
      serviceName: "rihtim-web",
      stdio: "inherit",
      cwd: webDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOSTNAME: HOST,
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_API_URL: `http://${HOST}:${API_PORT}`,
      },
    });
  }
}

function stopBackends(): void {
  apiProc?.kill();
  webProc?.kill();
  apiProc = null;
  webProc = null;
}

async function createWindow(): Promise<void> {
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

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Open target="_blank" / external links in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(WEB_URL)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(WEB_URL);
}

async function bootstrap(): Promise<void> {
  // Remove the default application menu (File / Edit / View / ...).
  Menu.setApplicationMenu(null);

  // When packaged we launch the bundled servers ourselves. In development we
  // assume `pnpm dev` is already serving the web (3030) and API (5170) apps.
  if (app.isPackaged) {
    await startBackends();
  }

  try {
    await waitForPort(WEB_PORT);
  } catch (err) {
    console.error("[rihtim] web server did not come up:", err);
  }

  await createWindow();
}

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
      void createWindow();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error("[rihtim] failed to start:", err);
    app.quit();
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", stopBackends);
app.on("will-quit", stopBackends);
