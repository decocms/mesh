import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration
 *
 * Uses storage state for authentication - run `bun run test:e2e:setup` first
 * to create a test user and save the auth session.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:4000",
    trace: "on-first-retry",
    // Use saved auth state for all tests
    storageState: "./e2e/.auth/user.json",
  },

  projects: [
    // Setup project runs first to create auth state
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  // Run the dev server before tests (in CI or when TEST_START_SERVER=1)
  webServer:
    process.env.CI || process.env.TEST_START_SERVER
      ? {
          command: "bun run dev",
          url: "http://localhost:4000",
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        }
      : undefined,
});
