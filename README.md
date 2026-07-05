# Rihtim

An open-source, web-based alternative to Docker Desktop. Connects to your local
Docker as well as **Docker running inside WSL** — with no extra port to expose.

> Turkish "rıhtım" = wharf/pier — a fitting name for a Docker-themed tool.

## Features

- 📊 **Dashboard**: engine info, container/image/CPU/memory summaries
- 📦 **Containers**: list, start/stop/restart/pause/kill, delete, prune
- 🖼️ **Images**: list, `docker pull`/`docker push` (live stream), Docker Hub search, private registry pull/push, delete
- 🧱 **Compose**: discover Compose projects, start/stop/restart/down, run up/down from compose files
- 🩺 **Troubleshoot**: runtime and Docker health checks, one-click fix suggestions, copy diagnostics JSON
- 💾 **Volumes**: list, create, delete, prune, size & ref-count reporting
- 🌐 **Networks**: list, create, delete, prune, detail drawer with connected containers
- 🔐 **Registries**: manage private registries with optional credentials and connectivity test
- 📡 **Live logs** (WebSocket)
- 🔌 **Multiple contexts**: Windows npipe, Unix socket, TCP, SSH, **WSL distro**

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
  api/    # Fastify + dockerode (Node.js)  — port 5170
  web/    # Next.js 14 + Tailwind          — port 3030
packages/
  shared/ # Shared TypeScript types
```

The web app proxies `/api/*` requests to the API via Next.js rewrites.

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

## Production

```bash
pnpm build
pnpm start
```
