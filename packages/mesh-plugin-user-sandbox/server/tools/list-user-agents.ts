/**
 * User Sandbox Plugin - List User Agents Tool
 */

import type { Kysely } from "kysely";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxListUserAgentsInputSchema,
  UserSandboxListUserAgentsOutputSchema,
} from "./schema";
import { orgHandler } from "./utils";

const EXTERNAL_USER_ID_KEY = "user_sandbox_external_user_id";
const TEMPLATE_ID_KEY = "user_sandbox_id";

interface ConnectionRow {
  id: string;
  title: string;
  organization_id: string;
  connection_type: string;
  metadata: string | null;
  created_at: string;
}

interface AgentDatabase {
  connections: ConnectionRow;
}

export const USER_SANDBOX_LIST_USER_AGENTS: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_LIST_USER_AGENTS",
  description:
    "List all agents (Virtual MCPs) created for an external user. " +
    "Use this to find agents created via user sandbox for a specific user in your platform.",
  inputSchema: UserSandboxListUserAgentsInputSchema,
  outputSchema: UserSandboxListUserAgentsOutputSchema,

  handler: orgHandler(
    UserSandboxListUserAgentsInputSchema,
    async (input, ctx) => {
      const db = ctx.db as Kysely<AgentDatabase>;

      const connections = await db
        .selectFrom("connections")
        .select(["id", "title", "connection_type", "metadata", "created_at"])
        .where("organization_id", "=", ctx.organization.id)
        .where("connection_type", "=", "VIRTUAL")
        .execute();

      const agents = connections
        .filter((conn) => {
          if (!conn.metadata) return false;
          try {
            const metadata = JSON.parse(conn.metadata);
            return metadata[EXTERNAL_USER_ID_KEY] === input.externalUserId;
          } catch {
            return false;
          }
        })
        .map((conn) => {
          const metadata = JSON.parse(conn.metadata!);
          return {
            id: conn.id,
            title: conn.title,
            external_user_id: input.externalUserId,
            template_id: (metadata[TEMPLATE_ID_KEY] as string) ?? null,
            created_at: conn.created_at,
          };
        });

      return { agents };
    },
  ),
};
