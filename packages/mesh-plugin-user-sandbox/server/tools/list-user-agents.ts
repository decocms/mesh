/**
 * User Sandbox Plugin - List User Agents Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxListUserAgentsInputSchema,
  UserSandboxListUserAgentsOutputSchema,
} from "./schema";

// Metadata fields used to tag user sandbox agents
const EXTERNAL_USER_ID_KEY = "user_sandbox_external_user_id";
const TEMPLATE_ID_KEY = "user_sandbox_id";

export const USER_SANDBOX_LIST_USER_AGENTS: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_LIST_USER_AGENTS",
  description:
    "List all agents (Virtual MCPs) created for an external user. " +
    "Use this to find agents created via user sandbox for a specific user in your platform.",
  inputSchema: UserSandboxListUserAgentsInputSchema,
  outputSchema: UserSandboxListUserAgentsOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof UserSandboxListUserAgentsInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
      storage: {
        connections: {
          list: (organizationId: string) => Promise<
            Array<{
              id: string;
              title: string;
              connection_type: string;
              metadata: Record<string, unknown> | null;
              created_at: string;
            }>
          >;
        };
      };
    };

    // Require organization context
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }

    // Check access
    await meshCtx.access.check();

    // Get all VIRTUAL connections (agents) in the organization
    const connections = await meshCtx.storage.connections.list(
      meshCtx.organization.id,
    );

    // Filter to agents created by user sandbox for this external user
    const agents = connections
      .filter((conn) => {
        if (conn.connection_type !== "VIRTUAL") return false;
        const metadata = conn.metadata as Record<string, unknown> | null;
        if (!metadata) return false;
        return metadata[EXTERNAL_USER_ID_KEY] === typedInput.externalUserId;
      })
      .map((conn) => {
        const metadata = conn.metadata as Record<string, unknown>;
        return {
          id: conn.id,
          title: conn.title,
          external_user_id: typedInput.externalUserId,
          template_id: (metadata[TEMPLATE_ID_KEY] as string) ?? null,
          created_at: conn.created_at,
        };
      });

    return { agents };
  },
};
