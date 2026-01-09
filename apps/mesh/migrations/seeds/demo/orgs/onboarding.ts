/**
 * Onboarding Organization
 *
 * Clean slate organization for onboarding - matches production behavior:
 * - 1 user (owner)
 * - 3 well-known connections (Mesh MCP, MCP Registry, Deco Store)
 * - 1 default gateway
 * - No monitoring logs
 */

import type { Kysely } from "kysely";
import type { Database } from "../../../../src/storage/types";
import type { OrgConfig, OrgSeedResult, OrgUser } from "../seeder";
import { createOrg } from "../seeder";
import { getWellKnownConnections } from "../catalog";

// =============================================================================
// Configuration
// =============================================================================

const EMAIL_DOMAIN = "@onboarding.local";

// Single owner user - matches production organization creation
const USERS: Record<string, OrgUser> = {
  admin: {
    role: "admin",
    memberRole: "owner",
    name: "Alice Admin",
    email: `admin${EMAIL_DOMAIN}`,
  },
};

// Only well-known connections - matches production seedOrgDb behavior
const CONNECTIONS = {
  ...getWellKnownConnections(),
};

// Default Hub with only well-known connections - matches production
const GATEWAYS = {
  defaultHub: {
    title: "Default Hub",
    description: "Auto-created Hub for organization",
    toolSelectionStrategy: "passthrough" as const,
    toolSelectionMode: "inclusion" as const,
    icon: null,
    isDefault: true,
    connections: ["meshMcp", "mcpRegistry", "decoStore"],
  },
};

// =============================================================================
// Seed Function
// =============================================================================

export const ONBOARDING_SLUG = "onboarding";

export async function seedOnboarding(
  db: Kysely<Database>,
): Promise<OrgSeedResult> {
  const config: OrgConfig = {
    orgName: "Onboarding",
    orgSlug: ONBOARDING_SLUG,
    users: USERS,
    apiKeys: [{ userKey: "admin", name: "Onboarding Admin Key" }],
    connections: CONNECTIONS,
    gateways: GATEWAYS,
    gatewayConnections: [
      // Default Hub with well-known connections (production behavior)
      { gatewayKey: "defaultHub", connectionKey: "meshMcp" },
      { gatewayKey: "defaultHub", connectionKey: "mcpRegistry" },
      { gatewayKey: "defaultHub", connectionKey: "decoStore" },
    ],
    logs: [], // Empty - matches production behavior
    ownerUserKey: "admin",
  };

  return createOrg(db, config);
}
