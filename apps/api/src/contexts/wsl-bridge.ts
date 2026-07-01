import net from "node:net";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

interface WslBridge {
  port: number;
  close: () => void;
}

const bridges = new Map<string, Promise<WslBridge>>();

function preflight(distro: string) {
  const hasSocat = spawnSync(
    "wsl.exe",
    ["-d", distro, "-u", "root", "--", "sh", "-lc", "command -v socat >/dev/null 2>&1"],
    { windowsHide: true },
  );
  if (hasSocat.status !== 0) {
    throw new Error(
      `socat not found in WSL distro '${distro}'. Install it with: wsl -d ${distro} -u root -- apt-get update && apt-get install -y socat`,
    );
  }
  const hasSocket = spawnSync(
    "wsl.exe",
    [
      "-d",
      distro,
      "-u",
      "root",
      "--",
      "sh",
      "-lc",
      "test -S /var/run/docker.sock",
    ],
    { windowsHide: true },
  );
  if (hasSocket.status !== 0) {
    throw new Error(
      `/var/run/docker.sock is missing in WSL distro '${distro}'. Is the Docker daemon running? (e.g. sudo service docker start)`,
    );
  }
}

/**
 * Starts a local TCP -> WSL docker.sock bridge for the given distro.
 * Each incoming TCP connection spawns `wsl -d <distro> -u root socat - UNIX-CONNECT:/var/run/docker.sock`
 * and pipes stdio to the socket. The returned port is stable per distro.
 *
 * Requirements inside the WSL distro:
 *   - `socat` installed (apt install -y socat)
 *   - docker daemon reachable via /var/run/docker.sock
 *   - user with permission to read the socket (uses -u root)
 */
export function ensureWslBridge(distro: string): Promise<WslBridge> {
  const key = distro.toLowerCase();
  const existing = bridges.get(key);
  if (existing) return existing;

  const promise = new Promise<WslBridge>((resolve, reject) => {
    try {
      preflight(distro);
    } catch (err) {
      reject(err);
      return;
    }

    const server = net.createServer((clientSock) => {
      const child: ChildProcessWithoutNullStreams = spawn(
        "wsl.exe",
        [
          "-d",
          distro,
          "-u",
          "root",
          "--",
          "socat",
          "-",
          "UNIX-CONNECT:/var/run/docker.sock",
        ],
        { windowsHide: true },
      );

      clientSock.on("error", () => child.kill());
      child.on("error", () => clientSock.destroy());
      child.on("exit", () => clientSock.end());

      clientSock.pipe(child.stdin);
      child.stdout.pipe(clientSock);
      child.stderr.on("data", () => {
        /* silence: surfaced only when connection fails */
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        resolve({
          port: address.port,
          close: () => server.close(),
        });
      } else {
        reject(new Error("failed to allocate bridge port"));
      }
    });
  });

  promise.catch(() => bridges.delete(key));
  bridges.set(key, promise);
  return promise;
}

export function closeAllBridges() {
  for (const p of bridges.values()) {
    p.then((b) => b.close()).catch(() => undefined);
  }
  bridges.clear();
}
