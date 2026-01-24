/**
 * User Sandbox Plugin - Create Session Tool
 *
 * Creates a connect session for an external user.
 * Also creates (or reuses) a Virtual MCP for this user - one per (template, external_user_id).
 */

import { z } from "zod";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxCreateSessionInputSchema,
  UserSandboxCreateSessionOutputSchema,
} from "./schema";
import { getPluginStorage, getConnectBaseUrl } from "./utils";

/** Default session expiration: 7 days */
const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

/** Type for the user_sandbox_agents linking table */
interface UserSandboxAgentRow {
  id: string;
  user_sandbox_id: string;
  external_user_id: string;
  connection_id: string;
  created_at: string;
}

/** Type for connection inserts */
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

/** Database type for queries */
interface AgentDatabase {
  user_sandbox_agents: UserSandboxAgentRow;
  connections: ConnectionInsert;
}

/**
 * Find or create a Virtual MCP for an external user.
 * Each (template_id, external_user_id) pair gets exactly one Virtual MCP.
 *
 * Uses a linking table (user_sandbox_agents) with a UNIQUE constraint to
 * prevent race conditions. The constraint ensures only one agent per
 * (user_sandbox_id, external_user_id) pair at the database level.
 *
 * Algorithm:
 * 1. Try INSERT OR IGNORE into linking table
 * 2. SELECT to get canonical connection_id
 * 3. If we won the race (our ID was inserted), create the connection
 * 4. If we lost (another ID exists), return the existing connection
 */
async function findOrCreateVirtualMCP(
  db: Kysely<unknown>,
  organizationId: string,
  createdBy: string,
  templateId: string,
  externalUserId: string,
  agentTitle: string,
  agentInstructions: string | null,
  toolSelectionMode: "inclusion" | "exclusion",
): Promise<string> {
  const typedDb = db as Kysely<AgentDatabase>;
  const now = new Date().toISOString();

  // Generate IDs for the new agent
  const linkingId = `usa_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;
  const connectionId = `vir_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;

  // Step 1: Try to insert into the linking table with ON CONFLICT DO NOTHING
  // The UNIQUE constraint on (user_sandbox_id, external_user_id) ensures atomicity
  await sql`
    INSERT INTO user_sandbox_agents (id, user_sandbox_id, external_user_id, connection_id, created_at)
    VALUES (${linkingId}, ${templateId}, ${externalUserId}, ${connectionId}, ${now})
    ON CONFLICT (user_sandbox_id, external_user_id) DO NOTHING
  `.execute(typedDb);

  // Step 2: Select the canonical agent (either ours or the race winner's)
  const canonical = await typedDb
    .selectFrom("user_sandbox_agents")
    .select("connection_id")
    .where("user_sandbox_id", "=", templateId)
    .where("external_user_id", "=", externalUserId)
    .executeTakeFirst();

  if (!canonical) {
    // This shouldn't happen - we just inserted or there was already a row
    throw new Error(
      `Failed to find or create agent for template ${templateId} and user ${externalUserId}`,
    );
  }

  // Step 3: If we won the race (our connection_id was inserted), create the actual connection
  if (canonical.connection_id === connectionId) {
    await typedDb
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
        metadata: JSON.stringify({
          user_sandbox_id: templateId,
          external_user_id: externalUserId,
          source: "user-sandbox",
        }),
        tools: null,
        bindings: null,
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  // Return the canonical connection ID (ours or the existing one)
  return canonical.connection_id;
}

export const USER_SANDBOX_CREATE_SESSION: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_CREATE_SESSION",
  description:
    "Create a connect session URL for an external user. " +
    "Returns a URL that the user can visit to configure their integrations. " +
    "Also creates a unique Virtual MCP (agent) for this user if one doesn't exist.",
  inputSchema: UserSandboxCreateSessionInputSchema,
  outputSchema: UserSandboxCreateSessionOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof UserSandboxCreateSessionInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      auth: { user: { id: string } | null };
      access: { check: () => Promise<void> };
      db: Kysely<unknown>;
    };

    // Require organization context
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }

    // Check access
    await meshCtx.access.check();

    const storage = getPluginStorage();

    // Verify template exists and belongs to organization
    const template = await storage.templates.findById(typedInput.templateId);
    if (!template) {
      throw new Error(`Template not found: ${typedInput.templateId}`);
    }
    if (template.organization_id !== meshCtx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }
    if (template.status !== "active") {
      throw new Error("Template is not active");
    }

    // Check for existing non-expired session for this user
    const existingSession = await storage.sessions.findExisting(
      typedInput.templateId,
      typedInput.externalUserId,
    );

    if (existingSession) {
      // Return existing session URL
      const baseUrl = getConnectBaseUrl();
      return {
        sessionId: existingSession.id,
        url: `${baseUrl}/connect/${existingSession.id}`,
        expiresAt: existingSession.expires_at,
        agentId: existingSession.created_agent_id,
      };
    }

    // Find or create Virtual MCP for this user
    const agentTitle = template.agent_title_template.replace(
      "{{externalUserId}}",
      typedInput.externalUserId,
    );
    const createdBy = template.created_by ?? meshCtx.auth.user?.id ?? "system";

    const agentId = await findOrCreateVirtualMCP(
      meshCtx.db,
      meshCtx.organization.id,
      createdBy,
      template.id,
      typedInput.externalUserId,
      agentTitle,
      template.agent_instructions,
      template.tool_selection_mode,
    );

    // Calculate expiration
    const expiresInSeconds =
      typedInput.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
    const expiresAt = new Date(
      Date.now() + expiresInSeconds * 1000,
    ).toISOString();

    // Create new session with the agent ID already set
    const session = await storage.sessions.create({
      template_id: typedInput.templateId,
      organization_id: meshCtx.organization.id,
      external_user_id: typedInput.externalUserId,
      redirect_url: template.redirect_url, // Snapshot from template
      expires_at: expiresAt,
      created_agent_id: agentId,
    });

    const baseUrl = getConnectBaseUrl();

    return {
      sessionId: session.id,
      url: `${baseUrl}/connect/${session.id}`,
      expiresAt: session.expires_at,
      agentId,
    };
  },
};
