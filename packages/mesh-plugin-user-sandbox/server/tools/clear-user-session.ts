/**
 * User Sandbox Plugin - Clear User Session Tool
 *
 * Clears all data for an external user, including:
 * - Virtual MCPs (agents) created for this user
 * - Child connections added to those agents
 * - OAuth tokens for those connections
 * - Sessions for this user
 * - User agent linking records
 */

import type { Kysely } from "kysely";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxClearUserSessionInputSchema,
  UserSandboxClearUserSessionOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

const EXTERNAL_USER_ID_KEY = "user_sandbox_external_user_id";

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

  handler: orgHandler(
    UserSandboxClearUserSessionInputSchema,
    async (input, ctx) => {
      const db = ctx.db as Kysely<ClearSessionDatabase>;
      const storage = getPluginStorage();

      const virtualMcps = await db
        .selectFrom("connections")
        .select(["id", "metadata"])
        .where("organization_id", "=", ctx.organization.id)
        .where("connection_type", "=", "VIRTUAL")
        .execute();

      const userAgentIds = virtualMcps
        .filter((conn) => {
          if (!conn.metadata) return false;
          try {
            const metadata = JSON.parse(conn.metadata);
            return metadata[EXTERNAL_USER_ID_KEY] === input.externalUserId;
          } catch {
            return false;
          }
        })
        .map((conn) => conn.id);

      let deletedConnections = 0;

      if (userAgentIds.length > 0) {
        const aggregations = await db
          .selectFrom("connection_aggregations")
          .select("child_connection_id")
          .where("parent_connection_id", "in", userAgentIds)
          .execute();

        const childConnectionIds = aggregations.map(
          (a) => a.child_connection_id,
        );

        await db
          .deleteFrom("connection_aggregations")
          .where("parent_connection_id", "in", userAgentIds)
          .execute();

        if (childConnectionIds.length > 0) {
          await db
            .deleteFrom("downstream_tokens")
            .where("connectionId", "in", childConnectionIds)
            .execute();

          await db
            .deleteFrom("connections")
            .where("id", "in", childConnectionIds)
            .execute();

          deletedConnections = childConnectionIds.length;
        }

        await db
          .deleteFrom("connections")
          .where("id", "in", userAgentIds)
          .execute();

        await db
          .deleteFrom("user_sandbox_agents")
          .where("external_user_id", "=", input.externalUserId)
          .execute();
      }

      const deletedSessions = await storage.sessions.deleteByExternalUserId(
        ctx.organization.id,
        input.externalUserId,
      );

      return {
        success: true,
        deletedAgents: userAgentIds.length,
        deletedConnections,
        deletedSessions,
      };
    },
  ),
};
