import { test, expect, api, uniqueName } from "../fixtures";

test("volumes: create, filter and delete", async ({ page }) => {
  const name = uniqueName("vol");
  await page.goto("/volumes");

  await page.getByPlaceholder("new volume name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await page.getByPlaceholder("Filter…").fill(name);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
  const left = await api.getJson<Array<{ name: string }>>("/volumes");
  expect(left.map((v) => v.name)).not.toContain(name);
});

test("volumes: detail page opens from the list", async ({ page }) => {
  const name = uniqueName("vol");
  await page.goto("/volumes");
  await page.getByPlaceholder("new volume name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();

  await page.getByRole("row").filter({ hasText: name }).click();
  await expect(page).toHaveURL(new RegExp(`/volumes/${name}$`));
  await expect(page.getByText(name).first()).toBeVisible();
});

test("networks: create, filter and delete", async ({ page }) => {
  const name = uniqueName("net");
  await page.goto("/networks");

  await page.getByPlaceholder("new network name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await page.getByPlaceholder("Filter…").fill(name);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
  const left = await api.getJson<Array<{ name: string }>>("/networks");
  expect(left.map((n) => n.name)).not.toContain(name);
});
