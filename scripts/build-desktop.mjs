// @ts-check
/**
 * Build orchestration for the Rihtim desktop (Electron) app.
 *
 * Steps:
 *   1. Build the API (tsc) and the web app (Next.js standalone).
 *   2. Compile the Electron main/preload.
 *   3. Stage a self-contained API (real node_modules via `pnpm deploy`).
 *   4. Stage the Next.js standalone server + static assets.
 *   5. Run electron-builder for the requested platform(s).
 *
 * Usage:
 *   node scripts/build-desktop.mjs            # current OS
 *   node scripts/build-desktop.mjs --win      # Windows targets
 *   node scripts/build-desktop.mjs --mac      # macOS targets (needs macOS)
 *   node scripts/build-desktop.mjs --linux    # Linux targets
 *
 * Any flags after the script name are forwarded to electron-builder, so you can
 * combine them, e.g. `--win --linux`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const desktopDir = path.join(root, "apps", "desktop");
const resourcesDir = path.join(desktopDir, "resources");
const webDist = path.join(root, "apps", "web", ".next");

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** Run a command, inheriting stdio. */
function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

// 1. Build API + web -------------------------------------------------------
step("Building API");
run(pnpm, ["--filter", "@rihtim/api", "build"]);

step("Building web (Next.js standalone)");
run(pnpm, ["--filter", "@rihtim/web", "build"]);

const standaloneDir = path.join(webDist, "standalone");
if (!existsSync(standaloneDir)) {
  throw new Error(
    `Next.js standalone output not found at ${standaloneDir}. ` +
      `Ensure apps/web/next.config.mjs sets output: "standalone".`,
  );
}

// 2. Compile the Electron shell -------------------------------------------
step("Compiling Electron main/preload");
run(pnpm, ["--filter", "@rihtim/desktop", "build:main"]);

// 3. Stage resources -------------------------------------------------------
step("Staging bundled servers");
rmSync(resourcesDir, { recursive: true, force: true });
mkdirSync(resourcesDir, { recursive: true });

// 3a. Self-contained API with a FLAT, real node_modules tree.
// pnpm's deployed tree uses symlinks/junctions that break when the NSIS
// installer is extracted on the user's machine (the app then fails to start),
// so we generate a plain, deduped `npm install` instead.
const serverOut = path.join(resourcesDir, "server");
mkdirSync(serverOut, { recursive: true });
cpSync(path.join(root, "apps", "api", "dist"), path.join(serverOut, "dist"), { recursive: true });

// Pruned manifest: drop the workspace-only, type-erased dependency and dev cruft.
const apiPkg = JSON.parse(readFileSync(path.join(root, "apps", "api", "package.json"), "utf8"));
if (apiPkg.dependencies) delete apiPkg.dependencies["@rihtim/shared"];
delete apiPkg.devDependencies;
delete apiPkg.scripts;
writeFileSync(path.join(serverOut, "package.json"), JSON.stringify(apiPkg, null, 2));

run(npm, ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], serverOut);

// 3b. Next.js standalone server + assets. Copy with `dereference` so pnpm
// symlinks are materialised into real files (to survive NSIS extraction).
const webOut = path.join(resourcesDir, "web");
cpSync(standaloneDir, webOut, { recursive: true, dereference: true });
// Static assets are NOT included in the standalone bundle by design.
cpSync(path.join(webDist, "static"), path.join(webOut, "apps", "web", ".next", "static"), {
  recursive: true,
  dereference: true,
});
const publicDir = path.join(root, "apps", "web", "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(webOut, "apps", "web", "public"), {
    recursive: true,
    dereference: true,
  });
}

// 4. Package with electron-builder ----------------------------------------
step("Running electron-builder");
const forwarded = process.argv.slice(2);
run(pnpm, [
  "--filter",
  "@rihtim/desktop",
  "exec",
  "electron-builder",
  "--config",
  "electron-builder.yml",
  ...forwarded,
]);

step("Done — installers are in apps/desktop/release");
