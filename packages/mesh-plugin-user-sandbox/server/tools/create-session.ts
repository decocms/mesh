/**
 * User Sandbox Plugin - Create Session Tool
 *
 * Creates a connect session for an external user.
 * Also creates (or reuses) a Virtual MCP for this user - one per (template, external_user_id).
 */

import type { Kysely } from "kysely";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxCreateSessionInputSchema,
  UserSandboxCreateSessionOutputSchema,
} from "./schema";
import { getPluginStorage, getConnectBaseUrl, orgHandler } from "./utils";
import { createAgentMetadata } from "../security";

const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

interface UserSandboxAgentRow {
  id: string;
  user_sandbox_id: string;
  external_user_id: string;
  connection_id: string;
  created_at: string;
}

interface ConnectionInsert {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string | null;
  icon: string | null;
  app_name: string | null;
  app_id: string | null;
  connection_type: string;
  connection_url: string | null;
  connection_token: string | null;
  connection_headers: string | null;
  oauth_config: string | null;
  configuration_state: string | null;
  configuration_scopes: string | null;
  metadata: string | null;
  tools: string | null;
  bindings: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AgentDatabase {
  user_sandbox_agents: UserSandboxAgentRow;
  connections: ConnectionInsert;
}

interface FindOrCreateResult {
  connectionId: string;
  created: boolean;
}

async function findOrCreateVirtualMCP(
  db: Kysely<unknown>,
  organizationId: string,
  createdBy: string,
  templateId: string,
  externalUserId: string,
  agentTitle: string,
  agentInstructions: string | null,
  toolSelectionMode: "inclusion" | "exclusion",
): Promise<FindOrCreateResult> {
  const typedDb = db as Kysely<AgentDatabase>;

  const existing = await typedDb
    .selectFrom("user_sandbox_agents")
    .select("connection_id")
    .where("user_sandbox_id", "=", templateId)
    .where("external_user_id", "=", externalUserId)
    .executeTakeFirst();

  if (existing) {
    return { connectionId: existing.connection_id, created: false };
  }

  const now = new Date().toISOString();
  const linkingId = `usa_${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").substring(0, 8)}`;
  const connectionId = `vir_${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").substring(0, 8)}`;

  try {
    await typedDb.transaction().execute(async (trx) => {
      await trx
        .insertInto("connections")
        .values({
          id: connectionId,
          organization_id: organizationId,
          created_by: createdBy,
          title: agentTitle,
          description: agentInstructions,
          icon: null,
          app_name: null,
          app_id: null,
          connection_type: "VIRTUAL",
          connection_url: `virtual://${connectionId}`,
          connection_token: null,
          connection_headers: JSON.stringify({
            tool_selection_mode: toolSelectionMode,
          }),
          oauth_config: null,
          configuration_state: null,
          configuration_scopes: null,
          metadata: JSON.stringify(
            createAgentMetadata(externalUserId, templateId),
          ),
          tools: null,
          bindings: null,
          status: "active",
          created_at: now,
          updated_at: now,
        })
        .execute();

      await trx
        .insertInto("user_sandbox_agents")
        .values({
          id: linkingId,
          user_sandbox_id: templateId,
          external_user_id: externalUserId,
          connection_id: connectionId,
          created_at: now,
        })
        .execute();
    });

    return { connectionId, created: true };
  } catch (error) {
    const errorMessage = String(error);
    if (
      errorMessage.includes("UNIQUE constraint") ||
      errorMessage.includes("duplicate key")
    ) {
      const winner = await typedDb
        .selectFrom("user_sandbox_agents")
        .select("connection_id")
        .where("user_sandbox_id", "=", templateId)
        .where("external_user_id", "=", externalUserId)
        .executeTakeFirst();

      if (winner) {
        return { connectionId: winner.connection_id, created: false };
      }
    }

    throw error;
  }
}

export const USER_SANDBOX_CREATE_SESSION: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_CREATE_SESSION",
  description:
    "Create a connect session URL for an external user. " +
    "Returns a URL that the user can visit to configure their integrations. " +
    "Also creates a unique Virtual MCP (agent) for this user if one doesn't exist.",
  inputSchema: UserSandboxCreateSessionInputSchema,
  outputSchema: UserSandboxCreateSessionOutputSchema,

  handler: orgHandler(
    UserSandboxCreateSessionInputSchema,
    async (input, ctx) => {
      const storage = getPluginStorage();

      const template = await storage.templates.findById(input.templateId);
      if (!template) {
        throw new Error(`Template not found: ${input.templateId}`);
      }
      if (template.organization_id !== ctx.organization.id) {
        throw new Error(
          "Access denied: template belongs to another organization",
        );
      }
      if (template.status !== "active") {
        throw new Error("Template is not active");
      }

      const agentTitle = template.agent_title_template.replace(
        "{{externalUserId}}",
        input.externalUserId,
      );
      const createdBy = template.created_by ?? ctx.auth.user?.id ?? "system";

      const { connectionId: agentId, created: agentCreated } =
        await findOrCreateVirtualMCP(
          ctx.db,
          ctx.organization.id,
          createdBy,
          template.id,
          input.externalUserId,
          agentTitle,
          template.agent_instructions,
          template.tool_selection_mode,
        );

      const existingSession = await storage.sessions.findExisting(
        input.templateId,
        input.externalUserId,
      );

      if (existingSession) {
        if (!existingSession.created_agent_id) {
          await storage.sessions.update(existingSession.id, {
            created_agent_id: agentId,
          });
        }

        const baseUrl = getConnectBaseUrl();
        return {
          sessionId: existingSession.id,
          url: `${baseUrl}/connect/${existingSession.id}`,
          expiresAt: existingSession.expires_at,
          agentId: existingSession.created_agent_id ?? agentId,
          created: agentCreated,
        };
      }

      const expiresInSeconds =
        input.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
      const expiresAt = new Date(
        Date.now() + expiresInSeconds * 1000,
      ).toISOString();

      const session = await storage.sessions.create({
        template_id: input.templateId,
        organization_id: ctx.organization.id,
        external_user_id: input.externalUserId,
        redirect_url: template.redirect_url,
        expires_at: expiresAt,
        created_agent_id: agentId,
      });

      const baseUrl = getConnectBaseUrl();

      return {
        sessionId: session.id,
        url: `${baseUrl}/connect/${session.id}`,
        expiresAt: session.expires_at,
        agentId,
        created: agentCreated,
      };
    },
  ),
};
