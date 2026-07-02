import { app, BrowserWindow, shell, utilityProcess } from "electron";
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

/** Spawn the bundled API and Next.js servers using Electron's built-in Node. */
function startBackends(): void {
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
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
  // When packaged we launch the bundled servers ourselves. In development we
  // assume `pnpm dev` is already serving the web (3030) and API (5170) apps.
  if (app.isPackaged) {
    startBackends();
  }

  try {
    await waitForPort(WEB_PORT);
  } catch (err) {
    console.error("[rihtim] web server did not come up:", err);
  }

  await createWindow();
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error("[rihtim] failed to start:", err);
  app.quit();
});

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
