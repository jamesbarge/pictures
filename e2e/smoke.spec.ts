import { test, expect } from "@playwright/test";

/**
 * Smoke Tests
 * Basic tests to verify the application loads correctly
 */

test.describe("Smoke Tests", () => {
  test("homepage loads successfully", async ({ page }) => {
    await page.goto("/");

    // Page should have a title
    await expect(page).toHaveTitle(/postboxd/i);

    // Main content should be visible
    await expect(page.locator("main")).toBeVisible();
  });

  test("navigation is accessible", async ({ page }) => {
    await page.goto("/");

    // Header should be present
    await expect(page.locator("header")).toBeVisible();
  });
});

test.describe("Calendar Page", () => {
  test("displays screenings content area", async ({ page }) => {
    await page.goto("/");

    // Wait for the page to load
    await page.waitForLoadState("networkidle");

    // Page should show either screenings or a loading state
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});
