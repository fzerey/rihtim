import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shown in the sidebar; comes from this package's version so releases only bump package.json.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  transpilePackages: ["@rihtim/shared"],
  // Self-contained server bundle for packaging inside the desktop (Electron) app.
  output: "standalone",
  // Monorepo: trace files from the repo root so workspace deps are included.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // The Electron shell loads the dev server via 127.0.0.1, which Next treats as a separate origin.
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5170";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/ws/:path*", destination: `${api}/ws/:path*` },
    ];
  },
};

export default nextConfig;
