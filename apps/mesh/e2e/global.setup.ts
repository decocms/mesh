import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/user.json");

/**
 * Global setup: Create a test user and save authenticated session
 *
 * This runs once before all tests. It signs up (or signs in) a test user
 * and saves the session cookies to be reused by all tests.
 *
 * Test credentials (configure via env or use defaults):
 * - TEST_USER_EMAIL: test@example.com
 * - TEST_USER_PASSWORD: TestPassword123!
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL || "test@example.com";
  const password = process.env.TEST_USER_PASSWORD || "TestPassword123!";
  const name = process.env.TEST_USER_NAME || "Test User";

  // Go to login page
  await page.goto("/login");

  // Wait for the auth form to be visible
  await page.waitForSelector("form", { timeout: 10000 });

  // Check if we're on a sign-in or sign-up form
  // Try to sign in first, if that fails, sign up
  const signInTab = page.getByRole("tab", { name: /sign in/i });
  const signUpTab = page.getByRole("tab", { name: /sign up/i });

  // If tabs exist, we have a unified auth form
  if (await signInTab.isVisible()) {
    // Try sign in first
    await signInTab.click();

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait a bit for the response
    await page.waitForTimeout(2000);

    // Check if we're still on login (sign in failed, need to sign up)
    if (page.url().includes("/login")) {
      console.log("Sign in failed, trying sign up...");

      // Switch to sign up
      await signUpTab.click();

      await page.getByLabel(/name/i).fill(name);
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole("button", { name: /sign up/i }).click();

      // Wait for redirect after signup
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15000,
      });
    }
  } else {
    // Fallback: just try filling in the form directly
    const emailInput = page.getByLabel(/email/i);
    const passwordInput = page.getByLabel(/password/i);
    const nameInput = page.getByLabel(/name/i);

    // If name field exists, it's a sign-up form
    if (await nameInput.isVisible()) {
      await nameInput.fill(name);
    }

    await emailInput.fill(email);
    await passwordInput.fill(password);

    // Click submit
    await page.getByRole("button", { name: /sign|submit/i }).click();
  }

  // Wait for successful authentication (should redirect away from login)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });

  // Verify we're authenticated by checking for common UI elements
  // The shell should show the user menu or organization selector
  await page.waitForSelector(
    '[data-testid="user-menu"], [data-testid="org-selector"], nav',
    {
      timeout: 10000,
    },
  );

  // Save the storage state (cookies + localStorage)
  await page.context().storageState({ path: authFile });

  console.log(`Auth state saved to ${authFile}`);
});
