import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@rihtim/shared"],
  // Self-contained server bundle for packaging inside the desktop (Electron) app.
  output: "standalone",
  // Monorepo: trace files from the repo root so workspace deps are included.
  // (Top-level in Next 15+, but under `experimental` for Next 14.)
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5170";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/ws/:path*", destination: `${api}/ws/:path*` },
    ];
  },
};

export default nextConfig;
