import { expect, test } from "@playwright/test";

const username = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const password = "playwright123";

test.describe("auth flow", () => {
  test("registers a new account and lands on /carteira", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /criar conta/i }).click();
    await page.locator("input[type=text]").fill(username);
    await page.locator("input[type=password]").fill(password);
    await page.getByRole("button", { name: /criar conta/i }).click();
    await page.waitForURL(/\/carteira/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/carteira/);
  });

  test("logs in with the same credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type=text]").fill(username);
    await page.locator("input[type=password]").fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/carteira/, { timeout: 15_000 });
  });

  test("rejects bogus credentials with an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type=text]").fill("nobody-here");
    await page.locator("input[type=password]").fill("badbadbad");
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page.getByText(/inválidos/i)).toBeVisible({ timeout: 10_000 });
  });
});
