/**
 * Demo Seed
 *
 * Creates a complete demo environment with:
 * - Fixed demo organization ("Demo Company")
 * - 5 users with different RBAC roles (admin, developer, analyst, billing, viewer)
 * - API keys for authentication
 * - 7 real MCP connections from deco-store (validated against registry)
 * - 3 gateways: OpenRouter Gateway (dedicated), All Tools Gateway (default), Smart Gateway (code_execution)
 * - Sample monitoring logs with realistic tool calls
 * - Organization settings
 *
 * This seed is open source and ensures consistency across all demo environments.
 * All MCPs use real URLs, icons, and descriptions from the deco registry.
 *
 * Usage:
 *   await seed(db)
 */

import type { Kysely } from "kysely";
import type { Database } from "../../../src/storage/types";
import { hashPassword } from "better-auth/crypto";

import type { DemoSeedResult } from "./types";
import { DEMO_CONFIG, DEMO_USERS, DEMO_MEMBER_ROLES } from "./config";
import { DEMO_CONNECTIONS } from "./connections";
import { DEMO_GATEWAYS } from "./gateways";
import { DEMO_MONITORING_LOGS } from "./monitoring-logs";
import {
  generateId,
  createUserRecord,
  createAccountRecord,
  createMemberRecord,
  createApiKeyRecord,
  createConnectionRecord,
  createGatewayRecord,
  createGatewayConnectionRecord,
  createMonitoringLogRecord,
} from "./factories";

/**
 * Run the demo seed
 */
export async function seed(db: Kysely<Database>): Promise<DemoSeedResult> {
  const now = new Date().toISOString();

  // Generate IDs
  const orgId = generateId("org");
  const userIds: Record<string, string> = {};
  for (const key of Object.keys(DEMO_USERS)) {
    userIds[key] = generateId("user");
  }

  // ============================================================================
  // 1. Create Organization
  // ============================================================================

  await db
    .insertInto("organization")
    .values({
      id: orgId,
      slug: DEMO_CONFIG.ORG_SLUG,
      name: DEMO_CONFIG.ORG_NAME,
      createdAt: now,
    })
    .execute();

  // ============================================================================
  // 2. Create Users
  // ============================================================================

  const userRecords = Object.entries(DEMO_USERS).map(([key, user]) =>
    createUserRecord(userIds[key]!, user.email, user.name, user.role, now),
  );

  for (const userRecord of userRecords) {
    await db
      // @ts-ignore: Better Auth user table
      .insertInto("user")
      .values(userRecord)
      .execute();
  }

  // ============================================================================
  // 3. Create Credential Accounts (for email/password login)
  // ============================================================================

  const passwordHash = await hashPassword(DEMO_CONFIG.PASSWORD);

  const accountRecords = Object.entries(DEMO_USERS).map(([key, user]) =>
    createAccountRecord(userIds[key]!, user.email, passwordHash, now),
  );

  await db
    // @ts-ignore: Better Auth account table
    .insertInto("account")
    .values(accountRecords)
    .execute();

  // ============================================================================
  // 4. Link Users to Organization (Members)
  // ============================================================================

  const memberRecords = Object.entries(DEMO_MEMBER_ROLES).map(([key, role]) =>
    createMemberRecord(orgId, userIds[key]!, role, now),
  );

  await db.insertInto("member").values(memberRecords).execute();

  // ============================================================================
  // 5. Create API Keys
  // ============================================================================

  const adminApiKeyHash = `demo_key_admin_${generateId("key")}`;
  const memberApiKeyHash = `demo_key_member_${generateId("key")}`;

  await db
    // @ts-ignore: Better Auth apikey table
    .insertInto("apikey")
    .values([
      createApiKeyRecord(
        userIds.admin!,
        "Demo Admin API Key",
        adminApiKeyHash,
        now,
      ),
      createApiKeyRecord(
        userIds.developer!,
        "Demo Developer API Key",
        memberApiKeyHash,
        now,
      ),
    ])
    .execute();

  // ============================================================================
  // 6. Create MCP Connections (Real deco MCPs)
  // ============================================================================

  const connectionIds: Record<string, string> = {};
  for (const key of Object.keys(DEMO_CONNECTIONS)) {
    connectionIds[key] = generateId("conn");
  }

  const connectionRecords = Object.entries(DEMO_CONNECTIONS).map(
    ([key, conn]) =>
      createConnectionRecord(
        connectionIds[key]!,
        orgId,
        userIds.admin!,
        conn.title,
        conn.description,
        conn.icon,
        conn.appName,
        conn.connectionUrl,
        conn.connectionToken,
        conn.configurationState,
        conn.metadata,
        now,
      ),
  );

  await db.insertInto("connections").values(connectionRecords).execute();

  // ============================================================================
  // 7. Create Gateways
  // ============================================================================

  const gatewayIds: Record<string, string> = {};
  for (const key of Object.keys(DEMO_GATEWAYS)) {
    gatewayIds[key] = generateId("gtw");
  }

  const gatewayRecords = Object.entries(DEMO_GATEWAYS).map(([key, gateway]) =>
    createGatewayRecord(
      gatewayIds[key]!,
      orgId,
      gateway.title,
      gateway.description,
      gateway.toolSelectionStrategy,
      gateway.toolSelectionMode,
      gateway.icon,
      gateway.isDefault,
      userIds.admin!,
      now,
    ),
  );

  await db.insertInto("gateways").values(gatewayRecords).execute();

  // ============================================================================
  // 8. Link Gateways to Connections
  // ============================================================================

  const gatewayConnectionRecords = Object.entries(DEMO_GATEWAYS).flatMap(
    ([gatewayKey, gateway]) =>
      gateway.connections.map((connKey) =>
        createGatewayConnectionRecord(
          gatewayIds[gatewayKey]!,
          connectionIds[connKey]!,
          now,
        ),
      ),
  );

  await db
    .insertInto("gateway_connections")
    .values(gatewayConnectionRecords)
    .execute();

  // ============================================================================
  // 9. Create Sample Monitoring Logs (Rich Demo Data - 7 days)
  // ============================================================================

  const monitoringLogRecords = DEMO_MONITORING_LOGS.map((log) => {
    const timestamp = new Date(Date.now() + log.offsetMs).toISOString();
    const gatewayId = log.gatewayKey ? gatewayIds[log.gatewayKey]! : null;

    return createMonitoringLogRecord(
      orgId,
      connectionIds[log.connectionKey]!,
      DEMO_CONNECTIONS[log.connectionKey]!.title,
      log.toolName,
      log.input,
      log.output,
      log.isError,
      log.errorMessage ?? null,
      log.durationMs,
      timestamp,
      userIds[log.userRole]!,
      log.userAgent,
      gatewayId,
      log.properties ?? null,
    );
  });

  await db.insertInto("monitoring_logs").values(monitoringLogRecords).execute();

  // ============================================================================
  // 10. Create Organization Settings
  // ============================================================================

  await db
    .insertInto("organization_settings")
    .values({
      organizationId: orgId,
      sidebar_items: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  // ============================================================================
  // Return Result
  // ============================================================================

  return {
    organizationId: orgId,
    organizationName: DEMO_CONFIG.ORG_NAME,
    organizationSlug: DEMO_CONFIG.ORG_SLUG,
    users: {
      adminId: userIds.admin!,
      adminEmail: DEMO_USERS.admin!.email,
      developerId: userIds.developer!,
      developerEmail: DEMO_USERS.developer!.email,
      analystId: userIds.analyst!,
      analystEmail: DEMO_USERS.analyst!.email,
      billingId: userIds.billing!,
      billingEmail: DEMO_USERS.billing!.email,
      viewerId: userIds.viewer!,
      viewerEmail: DEMO_USERS.viewer!.email,
    },
    apiKeys: {
      admin: adminApiKeyHash,
      member: memberApiKeyHash,
    },
    connectionIds: Object.values(connectionIds),
    gatewayIds: Object.values(gatewayIds),
  };
}
