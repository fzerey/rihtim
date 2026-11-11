import { test as base, expect } from "@playwright/test";
import { API_URL, E2E_PREFIX } from "./env";

type Named = { id: string; name?: string; names?: string[] };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function del(path: string) {
  await fetch(`${API_URL}/api${path}`, { method: "DELETE" });
}

const isOurs = (name: string | undefined) => !!name && name.replace(/^\//, "").startsWith(E2E_PREFIX);

/** Removes only containers, volumes and networks whose name starts with the e2e prefix. */
export async function sweepDocker() {
  const containers = await getJson<Named[]>("/containers?all=true");
  for (const c of containers) if (c.names?.some(isOurs)) await del(`/containers/${c.id}?force=true`);
  const volumes = await getJson<Named[]>("/volumes");
  for (const v of volumes) if (isOurs(v.name)) await del(`/volumes/${encodeURIComponent(v.name!)}?force=true`);
  const networks = await getJson<Named[]>("/networks");
  for (const n of networks) if (isOurs(n.name)) await del(`/networks/${n.id}`);
}

export const api = { getJson, del };
export const uniqueName = (kind: string) => `${E2E_PREFIX}${kind}-${Date.now().toString(36)}`;

export const test = base.extend<{ browserErrors: string[] }, { dockerSweep: void }>({
  dockerSweep: [
    async ({}, use) => {
      await sweepDocker();
      await use();
      await sweepDocker();
    },
    { scope: "worker", auto: true },
  ],

  browserErrors: async ({}, use) => {
    await use([]);
  },

  page: async ({ page, browserErrors }, use) => {
    // Pin language and theme once per tab; tests that switch them later are not overridden.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("rihtim.e2e")) return;
      localStorage.setItem("rihtim.locale", "en");
      localStorage.setItem("rihtim.theme", "dark");
      sessionStorage.setItem("rihtim.e2e", "1");
    });
    page.on("pageerror", (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") browserErrors.push(`console: ${m.text()}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500) browserErrors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
    });
    await use(page);
    expect(browserErrors, "browser errors during the test").toEqual([]);
  },
});

export { expect };
