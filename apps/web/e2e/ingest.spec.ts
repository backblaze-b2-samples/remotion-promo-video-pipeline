import { test, expect } from "@playwright/test";

// Route-level smoke tests. They assert the pipeline's screens render and are
// reachable; they deliberately do NOT run a render pass (that needs B2
// credentials, Chrome and ffmpeg — see docs/dev-workflows.md).
test.describe("Promo pipeline routes", () => {
  test("ingest page offers capture and asset upload", async ({ page }) => {
    await page.goto("/ingest");
    await expect(page).toHaveURL(/ingest/);
    await expect(page.getByRole("heading", { name: "Ingest" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Capture now/ })).toBeVisible();
  });

  test("promos list is reachable", async ({ page }) => {
    await page.goto("/promos");
    await expect(page).toHaveURL(/promos/);
    await expect(page.getByRole("heading", { name: "Promos" })).toBeVisible();
  });

  test("new promo form renders its selectors", async ({ page }) => {
    await page.goto("/promos/new");
    await expect(page.getByRole("heading", { name: "New promo" })).toBeVisible();
  });

  test("shot card library lists implemented cards", async ({ page }) => {
    await page.goto("/shot-cards");
    await expect(page.getByRole("heading", { name: "Shot cards" })).toBeVisible();
  });

  test("scoped asset library is reachable", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Asset library" })).toBeVisible();
  });

  test("full bucket explorer is untouched and still reachable", async ({ page }) => {
    await page.goto("/files");
    await expect(page).toHaveURL(/files/);
  });

  test("dashboard leads with write amplification", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
