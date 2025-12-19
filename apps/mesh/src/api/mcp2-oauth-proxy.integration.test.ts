import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createDatabase, closeDatabase, type MeshDatabase } from "../database";
import type { EventBus } from "../event-bus";
import { createTestSchema } from "../storage/test-helpers";
import { createApp } from "./app";

/**
 * Integration tests for MCP2 OAuth Proxy
 *
 * These tests verify that the OAuth proxy correctly:
 * 1. Proxies protected resource metadata from origin MCP
 * 2. Rewrites resource and authorization_servers URLs to our proxy
 * 3. Proxies authorization server metadata
 * 4. Rewrites OAuth endpoint URLs
 * 5. Proxies OAuth endpoints (authorize, token, register)
 *
 * Uses Stripe MCP as the test origin server.
 */

const STRIPE_MCP_URL = "https://mcp.stripe.com";
const TEST_CONNECTION_ID = "conn_test_stripe_oauth";

/**
 * Create a no-op mock event bus for testing
 */
function createMockEventBus(): EventBus {
  return {
    start: async () => {},
    stop: () => {},
    isRunning: () => false,
    publish: async () =>
      ({
        id: "mock-event",
        organizationId: "org",
        type: "test",
        source: "test",
        specversion: "1.0",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        status: "pending",
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as never,
    subscribe: async () =>
      ({
        id: "mock-sub",
        organizationId: "org",
        connectionId: "conn",
        eventType: "test",
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as never,
    unsubscribe: async () => ({ success: true }),
    listSubscriptions: async () => [],
    getEvent: async () => null,
    cancelEvent: async () => ({ success: true }),
    ackEvent: async () => ({ success: true }),
    getSubscription: async () => null,
    syncSubscriptions: async () => ({
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      subscriptions: [],
    }),
  };
}

describe("MCP2 OAuth Proxy Integration Tests", () => {
  let database: MeshDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await createTestSchema(database.db);

    // Create a test organization
    await database.db
      .insertInto("organization")
      .values({
        id: "org_test",
        name: "Test Organization",
        slug: "test-org",
        createdAt: new Date(),
      })
      .execute();

    // Create a test connection pointing to Stripe MCP
    await database.db
      .insertInto("mcp_connection")
      .values({
        id: TEST_CONNECTION_ID,
        organization_id: "org_test",
        title: "Stripe MCP Test",
        connection_url: STRIPE_MCP_URL,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();

    app = createApp({
      database,
      eventBus: createMockEventBus(),
      skipAssetServer: true,
    });
  });

  afterEach(async () => {
    await closeDatabase(database);
  });

  describe("Protected Resource Metadata Proxy", () => {
    it("should proxy and rewrite protected resource metadata", async () => {
      const res = await app.request(
        `/.well-known/oauth-protected-resource/mcp2/${TEST_CONNECTION_ID}`,
      );

      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        resource: string;
        authorization_servers: string[];
      };

      // Resource should be rewritten to our proxy URL
      expect(data.resource).toContain(`/mcp2/${TEST_CONNECTION_ID}`);

      // Authorization servers should be rewritten to our proxy
      expect(data.authorization_servers).toHaveLength(1);
      expect(data.authorization_servers[0]).toContain(
        `/mcp2-oauth/${TEST_CONNECTION_ID}`,
      );
    });

    it("should return 404 for non-existent connection", async () => {
      const res = await app.request(
        "/.well-known/oauth-protected-resource/mcp2/conn_nonexistent",
      );

      expect(res.status).toBe(404);
    });

    it("should support alternative URL pattern", async () => {
      const res = await app.request(
        `/mcp2/${TEST_CONNECTION_ID}/.well-known/oauth-protected-resource`,
      );

      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        resource: string;
        authorization_servers: string[];
      };

      expect(data.resource).toContain(`/mcp2/${TEST_CONNECTION_ID}`);
    });
  });

  describe("Authorization Server Metadata Proxy", () => {
    it("should proxy and rewrite auth server metadata", async () => {
      const res = await app.request(
        `/.well-known/oauth-authorization-server/mcp2-oauth/${TEST_CONNECTION_ID}`,
      );

      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        issuer: string;
        authorization_endpoint: string;
        token_endpoint: string;
        registration_endpoint: string;
      };

      // Issuer should be from Stripe
      expect(data.issuer).toContain("stripe.com");

      // Endpoints should be rewritten to our proxy
      expect(data.authorization_endpoint).toContain(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/authorize`,
      );
      expect(data.token_endpoint).toContain(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/token`,
      );
      expect(data.registration_endpoint).toContain(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/register`,
      );
    });

    it("should return 404 for non-existent connection", async () => {
      const res = await app.request(
        "/.well-known/oauth-authorization-server/mcp2-oauth/conn_nonexistent",
      );

      expect(res.status).toBe(404);
    });
  });

  describe("OAuth Endpoint Proxy", () => {
    it("should proxy authorize endpoint and return redirect", async () => {
      const res = await app.request(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/authorize?response_type=code&client_id=test`,
      );

      // Stripe returns 302 redirect to login page
      expect(res.status).toBe(302);

      const location = res.headers.get("location");
      expect(location).toBeTruthy();
      expect(location).toContain("stripe.com");
    });

    it("should proxy token endpoint", async () => {
      // Token endpoint will return error without valid grant, but should reach Stripe
      const res = await app.request(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=authorization_code&code=invalid",
        },
      );

      // Should get a response from Stripe (400 for invalid request)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("should proxy register endpoint for dynamic client registration", async () => {
      const res = await app.request(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_name: "Test MCP Client",
            redirect_uris: ["http://localhost:3000/oauth/callback"],
          }),
        },
      );

      // Registration should return 201 or 200 on success, or 4xx on validation error
      // Either way, it should reach Stripe's endpoint
      expect(res.status).toBeLessThan(500);
    });

    it("should return 404 for unknown endpoint", async () => {
      const res = await app.request(
        `/mcp2-oauth/${TEST_CONNECTION_ID}/unknown`,
      );

      expect(res.status).toBe(404);
    });

    it("should return 404 for non-existent connection", async () => {
      const res = await app.request(
        `/mcp2-oauth/conn_nonexistent/authorize`,
      );

      expect(res.status).toBe(404);
    });
  });

  describe("MCP2 Proxy Endpoint", () => {
    it("should return 401 without authentication", async () => {
      const res = await app.request(`/mcp2/${TEST_CONNECTION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        }),
      });

      // Should return 401 from origin (Stripe requires auth)
      expect(res.status).toBe(401);

      // Should have WWW-Authenticate header for OAuth discovery
      const wwwAuth = res.headers.get("www-authenticate");
      expect(wwwAuth).toBeTruthy();
    });
  });
});

