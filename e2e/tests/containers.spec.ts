import { test, expect, api, uniqueName } from "../fixtures";
import { API_URL } from "../env";

const IMAGE = "busybox:latest";

test.beforeAll(async () => {
  const images = await api.getJson<Array<{ repoTags: string[] }>>("/images");
  if (images.some((i) => i.repoTags.includes(IMAGE))) return;
  const res = await fetch(`${API_URL}/api/images/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromImage: "busybox", tag: "latest" }),
  });
  await res.text();
});

test("container lifecycle: run from an image, stop, start, logs, remove", async ({ page }) => {
  test.setTimeout(120_000);
  const name = uniqueName("ctr");

  // Run from the Images page.
  await page.goto("/images");
  await page.getByPlaceholder("Filter…").fill(IMAGE);
  const imageRow = page.getByRole("row").filter({ hasText: IMAGE }).first();
  await imageRow.getByRole("button", { name: "Run container" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Command override").fill("sh -c 'echo rihtim-e2e-hello; sleep 600'");
  await expect(page.getByLabel("Start container after create")).toBeChecked();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page).toHaveURL(/\/containers\/[0-9a-f]{12,}$/);

  // Find it in the list.
  await page.goto("/containers");
  await page.getByPlaceholder("Filter…").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText("Running", { exact: true })).toBeVisible();

  // Stop, then start again.
  await row.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(row.getByText("Exited", { exact: true })).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Start", exact: true }).click();
  await expect(row.getByText("Running", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Logs drawer shows the container output.
  await row.getByRole("button", { name: "Logs", exact: true }).click();
  const logs = page.getByRole("dialog", { name: new RegExp(`Logs: ${name}`) });
  await expect(logs).toContainText("rihtim-e2e-hello");
  await page.keyboard.press("Escape");
  await expect(logs).toBeHidden();
  await row.getByRole("button", { name: "Logs", exact: true }).click();
  await logs.getByRole("button", { name: "Close" }).click();
  await expect(logs).toBeHidden();

  // Remove.
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toHaveCount(0);
  const left = await api.getJson<Array<{ names: string[] }>>("/containers?all=true");
  expect(left.flatMap((c) => c.names)).not.toContain(`/${name}`);
});

test("container detail page shows inspect data", async ({ page }) => {
  const name = uniqueName("ctr");
  const created = await fetch(`${API_URL}/api/containers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Image: IMAGE, name, Cmd: ["sleep", "600"] }),
  }).then((r) => r.json() as Promise<{ id: string }>);

  await page.goto(`/containers/${created.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.getByText(IMAGE).first()).toBeVisible();
});
