/**
 * Virtual MCP Route Tests
 *
 * Tests cross-tenant isolation: authenticated users must not be able to
 * access another organization's MCP gateway by setting the x-org-id header
 * to an org they are not a member of.
 */

// CredentialVault requires a valid 32-byte base64 ENCRYPTION_KEY.
// Must be set before any import triggers getSettings(), which freezes
// the settings singleton on first access.
process.env.ENCRYPTION_KEY ??= Buffer.from("0".repeat(32)).toString("base64");

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { auth } from "../../auth";
import {
  createTestDatabase,
  closeTestDatabase,
  type TestDatabase,
} from "../../database/test-db";
import type { EventBus } from "../../event-bus";
import { setGlobalSettings, getSettings } from "../../settings";
import { createTestSchema } from "../../storage/test-helpers";
import { createApp } from "../app";

// If settings were already frozen by a prior test file without
// ENCRYPTION_KEY, re-initialize them now that the env var is set.
if (!getSettings().encryptionKey) {
  setGlobalSettings({
    ...getSettings(),
    encryptionKey: process.env.ENCRYPTION_KEY!,
  });
}

function createMockEventBus(): EventBus {
  return {
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
    isRunning: () => false,
    start: async () => {},
    stop: async () => {},
    publish: async () => ({ success: true }) as any,
    subscribe: async () =>
      ({ success: true, subscriptionId: "mock-sub" }) as any,
    unsubscribe: async () => ({ success: true }),
    listSubscriptions: async () => [],
  };
}

describe("Virtual MCP cross-tenant isolation", () => {
  let database: TestDatabase;
  let app: Awaited<ReturnType<typeof createApp>>;

  const attackerUserId = "user_attacker";
  const victimOrgId = "org_victim";
  const attackerOrgId = "org_attacker";

  beforeEach(async () => {
    database = await createTestDatabase();
    await createTestSchema(database.db);
    app = await createApp({ database, eventBus: createMockEventBus() });

    const now = new Date().toISOString();

    // Create attacker user
    await database.db
      .insertInto("user" as any)
      .values({
        id: attackerUserId,
        email: "attacker@example.com",
        emailVerified: 0,
        name: "Attacker",
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await database.db
      .insertInto("users")
      .values({
        id: attackerUserId,
        email: "attacker@example.com",
        name: "Attacker",
        role: "user",
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    // Create victim organization
    await database.db
      .insertInto("organization" as any)
      .values({
        id: victimOrgId,
        name: "Victim Org",
        slug: "victim-org",
        createdAt: now,
      })
      .execute();

    // Create attacker organization
    await database.db
      .insertInto("organization" as any)
      .values({
        id: attackerOrgId,
        name: "Attacker Org",
        slug: "attacker-org",
        createdAt: now,
      })
      .execute();

    // Add attacker as member of their own org only
    await database.db
      .insertInto("member" as any)
      .values({
        id: "member_attacker",
        userId: attackerUserId,
        organizationId: attackerOrgId,
        role: "owner",
        createdAt: now,
      })
      .execute();

    // Mock auth: attacker is authenticated with their own org
    vi.spyOn(auth.api, "getMcpSession").mockResolvedValue(null);
    vi.spyOn(auth.api, "setActiveOrganization").mockResolvedValue(null as any);
    vi.spyOn(auth.api, "getSession" as any).mockImplementation(async () => ({
      user: { id: attackerUserId, email: "attacker@example.com" },
      session: { activeOrganizationId: attackerOrgId },
    }));
    vi.spyOn(auth.api, "getFullOrganization" as any).mockImplementation(
      async () => ({
        id: attackerOrgId,
        slug: "attacker-org",
        name: "Attacker Org",
        members: [{ userId: attackerUserId, role: "owner" }],
      }),
    );
  });

  afterEach(async () => {
    await closeTestDatabase(database);
    vi.restoreAllMocks();
  });

  it("should reject access when x-org-id points to an org the user is not a member of", async () => {
    const response = await app.request("/mcp/gateway", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-org-id": victimOrgId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "attacker", version: "1.0" },
        },
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("not a member");
  });

  it("should reject access when x-org-slug points to an org the user is not a member of", async () => {
    const response = await app.request("/mcp/gateway", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-org-slug": "victim-org",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "attacker", version: "1.0" },
        },
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("not a member");
  });

  it("should allow access when x-org-id points to the user's own org", async () => {
    const response = await app.request("/mcp/gateway", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-org-id": attackerOrgId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "legit-user", version: "1.0" },
        },
      }),
    });

    // Should not be 403 - the user is a member of this org
    // May get 404 (no agent configured) or 200, but NOT 403
    expect(response.status).not.toBe(403);
  });
});
