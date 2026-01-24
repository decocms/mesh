/**
 * User Sandbox Plugin - Clear User Session Tool
 *
 * Clears all data for an external user, including:
 * - Virtual MCPs (agents) created for this user
 * - Child connections added to those agents
 * - OAuth tokens for those connections
 * - Sessions for this user
 * - User agent linking records
 *
 * This is for users who want to revoke all access they've given.
 */

import { z } from "zod";
import type { Kysely } from "kysely";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxClearUserSessionInputSchema,
  UserSandboxClearUserSessionOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

// Metadata fields used to tag user sandbox agents
const EXTERNAL_USER_ID_KEY = "user_sandbox_external_user_id";

/** Database types for queries */
interface ClearSessionDatabase {
  connections: {
    id: string;
    organization_id: string;
    connection_type: string;
    metadata: string | null;
  };
  connection_aggregations: {
    id: string;
    parent_connection_id: string;
    child_connection_id: string;
  };
  user_sandbox_agents: {
    id: string;
    user_sandbox_id: string;
    external_user_id: string;
    connection_id: string;
  };
  downstream_tokens: {
    connectionId: string;
  };
}

export const USER_SANDBOX_CLEAR_USER_SESSION: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_CLEAR_USER_SESSION",
  description:
    "Clear all session data for an external user, revoking all access they've granted. " +
    "This deletes their agents (Virtual MCPs), child connections, OAuth tokens, and sessions. " +
    "Use this when a user wants to disconnect all their integrations.",
  inputSchema: UserSandboxClearUserSessionInputSchema,
  outputSchema: UserSandboxClearUserSessionOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof UserSandboxClearUserSessionInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
      db: Kysely<unknown>;
    };

    // Require organization context
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }

    // Check access
    await meshCtx.access.check();

    const db = meshCtx.db as Kysely<ClearSessionDatabase>;
    const storage = getPluginStorage();

    // Step 1: Find all Virtual MCPs (agents) for this external user
    const virtualMcps = await db
      .selectFrom("connections")
      .select(["id", "metadata"])
      .where("organization_id", "=", meshCtx.organization.id)
      .where("connection_type", "=", "VIRTUAL")
      .execute();

    // Filter to agents that belong to this external user
    const userAgentIds = virtualMcps
      .filter((conn) => {
        if (!conn.metadata) return false;
        try {
          const metadata = JSON.parse(conn.metadata);
          return metadata[EXTERNAL_USER_ID_KEY] === typedInput.externalUserId;
        } catch {
          return false;
        }
      })
      .map((conn) => conn.id);

    let deletedConnections = 0;

    if (userAgentIds.length > 0) {
      // Step 2: Get all child connections for these agents
      const aggregations = await db
        .selectFrom("connection_aggregations")
        .select("child_connection_id")
        .where("parent_connection_id", "in", userAgentIds)
        .execute();

      const childConnectionIds = aggregations.map((a) => a.child_connection_id);

      if (childConnectionIds.length > 0) {
        // Step 3: Delete OAuth tokens for child connections
        await db
          .deleteFrom("downstream_tokens")
          .where("connectionId", "in", childConnectionIds)
          .execute();

        // Step 4: Delete the child connections
        await db
          .deleteFrom("connections")
          .where("id", "in", childConnectionIds)
          .execute();

        deletedConnections = childConnectionIds.length;
      }

      // Step 5: Delete connection aggregations for these agents
      await db
        .deleteFrom("connection_aggregations")
        .where("parent_connection_id", "in", userAgentIds)
        .execute();

      // Step 6: Delete the Virtual MCPs (agents) themselves
      await db
        .deleteFrom("connections")
        .where("id", "in", userAgentIds)
        .execute();

      // Step 7: Delete the user_sandbox_agents linking records
      await db
        .deleteFrom("user_sandbox_agents")
        .where("external_user_id", "=", typedInput.externalUserId)
        .execute();
    }

    // Step 8: Delete all sessions for this user
    const deletedSessions = await storage.sessions.deleteByExternalUserId(
      meshCtx.organization.id,
      typedInput.externalUserId,
    );

    return {
      success: true,
      deletedAgents: userAgentIds.length,
      deletedConnections,
      deletedSessions,
    };
  },
};
