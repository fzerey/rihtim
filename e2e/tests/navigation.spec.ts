import { test, expect } from "../fixtures";

const PAGES: Array<[label: string, path: string, heading: RegExp]> = [
  ["Dashboard", "/", /Dashboard/],
  ["Containers", "/containers", /Containers/],
  ["Images", "/images", /Images/],
  ["Builds", "/builds", /Build/],
  ["Compose", "/compose", /Compose/],
  ["Volumes", "/volumes", /Volumes/],
  ["Networks", "/networks", /Networks/],
  ["Diagnostics", "/diagnostics", /.+/],
  ["Settings", "/settings", /Settings/],
];

test("sidebar reaches every page and marks it active", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation");
  for (const [label, path, heading] of PAGES) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path === "/" ? /\/$/ : new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("dashboard shows live engine data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // The Containers card links to the containers page and shows a number once /system/info resolves.
  const card = page.getByRole("main").getByRole("link").filter({ hasText: /^Containers/ }).first();
  await expect(card).toContainText(/\d+/);
  await expect(page.getByRole("button", { name: /local|npipe|socket/i }).first()).toBeVisible();
});

test("theme switch applies and survives a reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
  await page.reload();
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(html).toHaveClass(/dark/);
});

test("language switch translates the UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^en$/i }).click();
  await page.getByRole("button", { name: "Türkçe" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Panel");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Konteynerler" })).toBeVisible();

  await page.getByRole("button", { name: /^tr$/i }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
});

test("command palette opens with Ctrl+K and navigates", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Search pages, containers, images…");
  await expect(input).toBeFocused();
  await input.fill("volumes");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/volumes$/);
  await expect(input).toBeHidden();

  // Escape closes without navigating.
  await page.keyboard.press("Control+k");
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
  await expect(page).toHaveURL(/\/volumes$/);
});

test("settings: add and remove a Docker context", async ({ page }) => {
  // The API runs against an isolated data dir, so this never touches the real contexts.json.
  await page.goto("/settings");
  const form = page.locator(".card").filter({ hasText: "New context" });
  await form.getByLabel("Type").selectOption("tcp");
  await form.getByLabel("Name", { exact: true }).fill("rihtim-e2e-ctx");
  await form.getByLabel("Host").fill("127.0.0.1");
  await form.getByRole("button", { name: "Add" }).click();

  const card = page.locator(".card").filter({ hasText: "rihtim-e2e-ctx" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("127.0.0.1:2375");

  await card.getByRole("button", { name: "Remove" }).click();
  await expect(card).toHaveCount(0);
});
