import { expect, test } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("input[type=text]")).toBeVisible();
  await expect(page.locator("input[type=password]")).toBeVisible();
});

test("unauthenticated /carteira redirects to /login", async ({ page }) => {
  await page.goto("/carteira");
  await page.waitForURL(/\/login/, { timeout: 10_000 });
});
