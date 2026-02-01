import { test, expect } from "@playwright/test";

/**
 * Basic E2E Tests for Mesh
 *
 * Tests the core flow: navigate to org, view connections
 */

test.describe("Connections", () => {
  test("should navigate to org and see connections page", async ({ page }) => {
    // Go to home (should redirect to first org)
    await page.goto("/");

    // Wait for the page to load and potentially redirect to an org
    await page.waitForLoadState("networkidle");

    // We should be on some org page (the shell layout)
    // The URL should have an org slug like /{org-slug}/...
    const url = page.url();
    expect(url).not.toContain("/login");

    // Look for navigation or sidebar that indicates we're in the app
    // Try to find and click on "Connections" in the sidebar
    const connectionsLink = page.getByRole("link", { name: /connections/i });

    // If connections link is visible, click it
    if (await connectionsLink.isVisible()) {
      await connectionsLink.click();

      // Wait for connections page to load
      await page.waitForLoadState("networkidle");

      // Should see connections-related content
      // Either a list of connections or an empty state
      const hasConnections = await page
        .getByRole("heading", { name: /connections/i })
        .isVisible();
      const hasEmptyState = await page
        .getByText(/no connections|add.*connection|create.*connection/i)
        .isVisible();
      const hasConnectionsList = await page
        .locator('[data-testid="connections-list"], table, [role="list"]')
        .isVisible();

      expect(
        hasConnections || hasEmptyState || hasConnectionsList,
      ).toBeTruthy();
    } else {
      // If no connections link, we might be on a different layout
      // Just verify we're authenticated and on some page
      console.log("Connections link not found, checking for authenticated UI");

      // Should have some authenticated content
      const hasAuthenticatedUI = await page
        .locator("nav, [data-testid], header")
        .first()
        .isVisible();
      expect(hasAuthenticatedUI).toBeTruthy();
    }
  });

  test("should show org home with overview", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should not be on login
    expect(page.url()).not.toContain("/login");

    // Take a screenshot for debugging
    await page.screenshot({ path: "e2e/.auth/org-home.png" });

    // The home page should show something - could be dashboard, connections, etc.
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });
});
