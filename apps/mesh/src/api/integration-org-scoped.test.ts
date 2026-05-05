/**
 * Cross-route integration test for the org-scoped API.
 *
 * Exercises the dual-mounted routes end-to-end against a real (PGlite)
 * test database. Proves that legacy + new paths coexist correctly:
 *   - new path serves AND does NOT log deprecation
 *   - legacy path serves AND DOES log deprecation
 *   - unknown slug → 404 (from resolveOrgFromPath)
 *   - non-member → 403 (from resolveOrgFromPath)
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
  vi,
} from "bun:test";
import { sql } from "kysely";
import { auth } from "../auth";
import {
  closeTestDatabase,
  createTestDatabase,
  type TestDatabase,
} from "../database/test-db";
import type { EventBus } from "../event-bus";
import {
  createTestSchema,
  seedCommonTestFixtures,
} from "../storage/test-helpers";
import { createApp } from "./app";

/**
 * Create a no-op mock event bus for testing (mirrors integration.test.ts).
 */
function createMockEventBus(): EventBus {
  return {
    start: async () => {},
    stop: () => {},
    isRunning: () => false,
    publish: async () => ({}) as never,
    subscribe: async () => ({}) as never,
    unsubscribe: async () => ({ success: true }),
    listSubscriptions: async () => [],
    getSubscription: async () => null,
    getEvent: async () => null,
    cancelEvent: async () => ({ success: true }),
    ackEvent: async () => ({ success: true }),
    syncSubscriptions: async () => ({
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      subscriptions: [],
    }),
  };
}

/**
 * Build a verifyApiKey mock that returns a valid key bound to the given
 * userId + org. Lets us swap principals between tests (member vs non-member).
 */
function mockApiKey(userId: string, orgId: string, orgSlug: string) {
  vi.spyOn(auth.api, "verifyApiKey").mockResolvedValue({
    valid: true,
    error: null,
    key: {
      id: "test-key-id",
      name: "Test API Key",
      userId,
      // No permissions field — we don't need RBAC for the routes under test.
      // The handlers only check that ctx.organization.id is set + a real
      // connection exists.
      permissions: undefined,
      metadata: {
        organization: { id: orgId, slug: orgSlug, name: orgSlug },
      },
    },
    // oxlint-disable-next-line no-explicit-any
  } as never);
}

describe("org-scoped API coexistence", () => {
  let database: TestDatabase;
  let app: Awaited<ReturnType<typeof createApp>>;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    database = await createTestDatabase();
    await createTestSchema(database.db);
    await seedCommonTestFixtures(database.db);

    // Seed a second user (NOT a member of org_1) — used by the 403 test.
    const now = new Date().toISOString();
    await sql`
      INSERT INTO "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
      VALUES ('user_outsider', 'outsider@test.com', 0, 'Outsider', ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `.execute(database.db);

    // Seed a membership for user_1 in org_1 so resolveOrgFromPath admits us.
    await sql`
      INSERT INTO "member" (id, "userId", "organizationId", role, "createdAt")
      VALUES ('mem_1', 'user_1', 'org_1', 'member', ${now})
      ON CONFLICT (id) DO NOTHING
    `.execute(database.db);

    // Seed a connection owned by org_1 — the route under test does
    // findById(connectionId, organizationId), so this row must exist for both
    // the legacy path (200) and the new path (200) to succeed.
    await database.db
      .insertInto("connections")
      .values({
        id: "conn_1",
        organization_id: "org_1",
        created_by: "user_1",
        title: "Test Connection",
        connection_type: "HTTP",
        connection_url: "https://example.test",
        status: "active",
        pinned: false,
        created_at: now,
        updated_at: now,
      })
      .execute();

    // Build the app against the seeded DB. Production deps that aren't relevant
    // here (NATS, automations, decopilot streams) are stubbed by createApp when
    // an explicit eventBus is passed.
    app = await createApp({ database, eventBus: createMockEventBus() });

    // Default principal: user_1 (member of org_1). Tests can override.
    vi.spyOn(auth.api, "getMcpSession").mockResolvedValue(null);
    mockApiKey("user_1", "org_1", "org_1");

    // Spy on console.log AFTER createApp ran (createApp emits its own startup
    // logs that we don't want to assert on).
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    vi.restoreAllMocks();
    await closeTestDatabase(database);
  });

  it("new path serves the route AND does NOT log deprecation", async () => {
    const res = await app.fetch(
      new Request(
        "http://test/api/org_1/connections/conn_1/oauth-token/status",
        { headers: { Authorization: "Bearer test-key" } },
      ),
    );

    expect(res.status).toBe(200);

    const deprecationCalls = logSpy.mock.calls.filter(
      (args: unknown[]) => args[0] === "deprecated route",
    );
    expect(deprecationCalls).toHaveLength(0);
  });

  it("legacy path still serves AND DOES log deprecation", async () => {
    const res = await app.fetch(
      new Request("http://test/api/connections/conn_1/oauth-token/status", {
        headers: {
          Authorization: "Bearer test-key",
          // x-org-id is redundant when the API key carries org metadata, but
          // we send it to mirror the documented legacy contract.
          "x-org-id": "org_1",
        },
      }),
    );

    expect(res.status).toBe(200);

    const deprecationCalls = logSpy.mock.calls.filter(
      (args: unknown[]) => args[0] === "deprecated route",
    );
    expect(deprecationCalls.length).toBeGreaterThan(0);
  });

  it("new path returns 404 for unknown slug", async () => {
    const res = await app.fetch(
      new Request(
        "http://test/api/non-existent-slug/connections/conn_1/oauth-token/status",
        { headers: { Authorization: "Bearer test-key" } },
      ),
    );

    expect(res.status).toBe(404);
  });

  it("new path returns 403 for non-member principal", async () => {
    // Swap the API key mock so the request is authenticated as user_outsider,
    // who has no membership row in org_1.
    mockApiKey("user_outsider", "org_1", "org_1");

    const res = await app.fetch(
      new Request(
        "http://test/api/org_1/connections/conn_1/oauth-token/status",
        { headers: { Authorization: "Bearer test-key" } },
      ),
    );

    expect(res.status).toBe(403);
  });

  it("well-known prefix discovery for org-scoped MCP resolves the right org", async () => {
    // The MCP SDK probes /.well-known/oauth-protected-resource{resource-path}
    // (RFC 9728 Format 2 / Smithery-style) to discover OAuth metadata. With
    // org-scoped server URLs the probe path is
    // /.well-known/oauth-protected-resource/api/:org/mcp/:connectionId — this
    // path lives at the *root* (the well-known prefix is anchored there), not
    // under the /api/:org sub-app. Without a top-level mount the SDK gets a
    // 404 here and falls back to treating the mesh root as the auth server,
    // breaking every OAuth-gated MCP (GitHub import-from-repo, Cursor, etc.).

    // Mock the origin: well-known endpoints 404, but the initialize probe
    // returns a Bearer challenge with resource_metadata so checkOriginSupports
    // OAuth resolves true. The handler then synthesizes metadata pointing at
    // our proxy — and crucially MUST use the org-scoped /api/:org/... path
    // (not the legacy /mcp/:id shape) for both `resource` and
    // `authorization_servers`, otherwise the SDK's resource-allowed check
    // fails.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (
      _input,
      init,
    ) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        // Origin's MCP `initialize` probe — return an OAuth 401.
        return new Response(null, {
          status: 401,
          headers: {
            "WWW-Authenticate":
              'Bearer realm="origin", resource_metadata="https://example.test/.well-known/oauth-protected-resource"',
          },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch);

    // Use a localhost-shaped host so the handler's `fixProtocol` keeps the
    // http scheme (it forces https for non-localhost hosts).
    const reqHost = "http://mesh.localhost";
    try {
      const res = await app.fetch(
        new Request(
          `${reqHost}/.well-known/oauth-protected-resource/api/org_1/mcp/conn_1`,
        ),
      );

      // Route must exist (was 404 before the fix — no route was mounted for
      // this URL shape outside the /api/:org sub-app).
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        resource: string;
        authorization_servers: string[];
      };
      // Synthetic metadata MUST use the org-scoped /api/:org/... path for
      // `resource` so resourceUrlFromServerUrl(serverUrl) matches
      // resourceMetadata.resource (the SDK's checkResourceAllowed check);
      // otherwise OAuth fails with "Protected resource ... does not match
      // expected ...".
      expect(body.resource).toBe(`${reqHost}/api/org_1/mcp/conn_1`);
      // The auth-server URL stays on the legacy `/oauth-proxy/:id` path so
      // the SDK's RFC 8414 discovery hits the dedicated auth-server metadata
      // handler (which proxies the origin's metadata) instead of falling
      // through to Better Auth's catch-all — that path returns Better Auth's
      // MCP gateway endpoints and DCR ends with `invalid_client`.
      expect(body.authorization_servers[0]).toBe(
        `${reqHost}/oauth-proxy/conn_1`,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
