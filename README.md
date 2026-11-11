# Rihtim

An open-source, web-based alternative to Docker Desktop. Connects to your local
Docker as well as **Docker running inside WSL** — with no extra port to expose.

> Turkish "rıhtım" = wharf/pier — a fitting name for a Docker-themed tool.

## Features

- 📊 **Dashboard**: engine info, container/image/CPU/memory summaries
- 📦 **Containers**: list, start/stop/restart/pause/kill, delete, prune
- 🖼️ **Images**: list, `docker pull`/`docker push` (live stream), Docker Hub search, private registry pull/push, run a container from an image, delete
- 🏗️ **Builds**: build images from a local context with live output, inspect and prune the build cache
- 🧱 **Compose**: discover Compose projects, start/stop/restart/down, run up/down from compose files
- 🩺 **Troubleshoot**: runtime and Docker health checks, one-click fix suggestions, copy diagnostics JSON
- 💾 **Volumes**: list, create, delete, prune, size & ref-count reporting
- 🌐 **Networks**: list, create, delete, prune, detail drawer with connected containers
- 🔐 **Registries**: manage private registries with optional credentials and connectivity test
- 📡 **Live logs** (WebSocket)
- 🔌 **Multiple contexts**: Windows npipe, Unix socket, TCP, SSH, **WSL distro**
- ⌨️ **Command palette** (`Ctrl+K` / `⌘K`), light and dark themes, 10 UI languages
- 🖥️ **Desktop app**: Electron build for Windows, macOS and Linux with its own title bar

### How WSL Connectivity Works

Rihtim bridges to the `/var/run/docker.sock` unix socket inside your WSL distro
over stdio, using `wsl.exe -d <distro> -u root socat`. No TCP exposure or Docker
Desktop required.

Requirements:

1. WSL2 installed.
2. Docker Engine installed and running inside the distro:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io socat
   sudo service docker start
   ```
3. Add a context of type **WSL distro** from the Settings page (use the name
   listed by `wsl -l -q`, e.g. `Ubuntu`).

## Architecture

```
apps/
  api/      # Fastify + dockerode (Node.js)      — port 5170
  web/      # Next.js 16 + React 19 + Tailwind v4 — port 3030
  desktop/  # Electron shell around web + api
packages/
  shared/   # Shared TypeScript types
e2e/        # Playwright end-to-end tests (web + desktop)
```

The web app proxies `/api/*` requests to the API via Next.js rewrites. The desktop
app loads the web UI in its own window; when packaged it starts the bundled API
and web servers itself.

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Development

Run API + Web together:

```bash
pnpm dev
```

- API: http://127.0.0.1:5170
- Web: http://localhost:3030

## Desktop app

With `pnpm dev` running, open the Electron window in another terminal:

```bash
pnpm desktop:dev
```

Build installers into `apps/desktop/release/`:

```bash
pnpm desktop:package           # current platform
node scripts/build-desktop.mjs --win --linux   # pick targets
```

Pushing a `v*` tag builds installers for all three platforms and attaches them to
a GitHub Release (`.github/workflows/desktop.yml`).

## Production

```bash
pnpm build
pnpm start
```

## Testing

```bash
pnpm typecheck   # TypeScript in every package
pnpm test:unit   # Vitest unit tests (apps/api, apps/web)
pnpm test:e2e    # Playwright: web UI and the Electron app
```

The E2E suite builds the app and starts its own API (port 5181) and web server
(port 3041), so it can run next to `pnpm dev`. It needs a running Docker engine.
It only creates Docker resources whose names start with `rihtim-e2e-` and removes
only those, so your own containers, images, volumes and networks are not touched.

Useful variants:

```bash
pnpm test:e2e:web       # browser tests only
pnpm test:e2e:desktop   # Electron tests only
pnpm --filter @rihtim/e2e report   # open the last HTML report
```

On Windows the web tests use the installed Microsoft Edge. Elsewhere, install
Playwright's Chromium once with `pnpm --filter @rihtim/e2e exec playwright install chromium`.

## Continuous integration

Every pull request runs `.github/workflows/ci.yml`:

1. **Typecheck & unit tests**: frozen-lockfile install, `pnpm typecheck`,
   `pnpm test:unit`, and the API/desktop builds used by the release.
2. **E2E (web + desktop)**: the Playwright suite on Ubuntu, with Electron in a
   virtual display. On failure the HTML report and traces are uploaded as the
   `playwright-report` artifact.

Both checks are required before merging into `main`.
