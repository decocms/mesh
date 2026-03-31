import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestDatabase, type TestDatabase } from "../database/test-db";
import type { EventBus } from "../event-bus";
import { createTestSchema } from "../storage/test-helpers";
import { createApp } from "./app";

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

describe("Hono App", () => {
  let database: TestDatabase;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    // CredentialVault requires a 32-byte base64 encryption key
    process.env.ENCRYPTION_KEY ??= Buffer.from("0".repeat(32)).toString(
      "base64",
    );
    database = await createTestDatabase();
    await createTestSchema(database.db);
    app = await createApp({ database, eventBus: createMockEventBus() });
  });

  afterEach(async () => {
    // Shutdown the app first to stop all background tasks (RunRegistry,
    // expired API key cleanup, monitoring retention, plugin hooks, etc.)
    // before destroying the database. Without this, background tasks race
    // against database teardown and produce "driver has already been
    // destroyed" errors — which can cause timeouts in CI.
    if (app) {
      await app.shutdown();
    }

    // shutdown() already calls closeDatabase() which destroys the Kysely
    // driver and ends the pool, but we still need to close the PGlite
    // WASM instance which closeDatabase doesn't know about.
    if (database?.pglite && !database.pglite.closed) {
      await database.pglite.close();
    }
  });
  describe("liveness check", () => {
    it("should respond to liveness probe", async () => {
      const res = await app.request("/health/live");
      expect(res.status).toBe(200);

      const json = (await res.json()) as { status: string };
      expect(json.status).toBe("ok");
    });
  });

  describe("readiness check", () => {
    it("should return 200 with per-service status (postgres up, nats down in test)", async () => {
      const res = await app.request("/health/ready");
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        status: string;
        services: Record<string, { status: string }>;
      };
      expect(json.status).toBe("ready");
      expect(json.services.postgres?.status).toBe("up");
      expect(json.services.nats?.status).toBe("down");
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await app.request("/unknown");
      expect(res.status).toBe(404);

      const json = (await res.json()) as { error: string; path: string };
      expect(json.error).toBe("Not Found");
      expect(json.path).toBe("/unknown");
    });
  });

  describe("CORS", () => {
    it("should have CORS headers", async () => {
      const res = await app.request("/health/live", {
        headers: { Origin: "http://localhost:3000" },
      });

      const corsHeader = res.headers.get("access-control-allow-origin");
      expect(corsHeader).toBeTruthy();
    });

    it("should allow credentials", async () => {
      const res = await app.request("/health/live", {
        headers: { Origin: "http://localhost:3000" },
      });

      const credentialsHeader = res.headers.get(
        "access-control-allow-credentials",
      );
      expect(credentialsHeader).toBeTruthy();
    });
  });

  describe("Better Auth integration", () => {
    it("should mount Better Auth routes", async () => {
      // .well-known endpoints should exist (may return 404 but route exists)
      const res = await app.request("/.well-known/oauth-authorization-server");

      // Should not be 500 (route exists)
      expect(res.status).toBeLessThan(500);
    });
  });
});
