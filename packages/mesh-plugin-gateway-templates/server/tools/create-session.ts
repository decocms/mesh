/**
 * Gateway Templates Plugin - Create Session Tool
 *
 * Creates a connect session for an external user.
 * Also creates (or reuses) a Virtual MCP for this user - one per (template, external_user_id).
 */

import { z } from "zod";
import type { Kysely } from "kysely";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  GatewayTemplateCreateSessionInputSchema,
  GatewayTemplateCreateSessionOutputSchema,
} from "./schema";
import { getPluginStorage, getConnectBaseUrl } from "./utils";

/** Default session expiration: 7 days */
const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

/**
 * Find or create a Virtual MCP for an external user.
 * Each (template_id, external_user_id) pair gets exactly one Virtual MCP.
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
  // Query for existing Virtual MCP with matching metadata
  const existingRows = await (
    db as Kysely<{
      connections: {
        id: string;
        metadata: string | null;
        connection_type: string;
        organization_id: string;
      };
    }>
  )
    .selectFrom("connections")
    .select(["id", "metadata"])
    .where("connection_type", "=", "VIRTUAL")
    .where("organization_id", "=", organizationId)
    .execute();

  // Find one with matching gateway_template_id and external_user_id
  for (const row of existingRows) {
    if (row.metadata) {
      try {
        const metadata = JSON.parse(row.metadata);
        if (
          metadata.gateway_template_id === templateId &&
          metadata.external_user_id === externalUserId
        ) {
          return row.id;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Create new Virtual MCP
  const now = new Date().toISOString();
  const id = `vir_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;

  await (
    db as Kysely<{
      connections: {
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
      };
    }>
  )
    .insertInto("connections")
    .values({
      id,
      organization_id: organizationId,
      created_by: createdBy,
      title: agentTitle,
      description: agentInstructions,
      icon: null,
      app_name: null,
      app_id: null,
      connection_type: "VIRTUAL",
      connection_url: `virtual://${id}`,
      connection_token: null,
      connection_headers: JSON.stringify({
        tool_selection_mode: toolSelectionMode,
      }),
      oauth_config: null,
      configuration_state: null,
      configuration_scopes: null,
      metadata: JSON.stringify({
        gateway_template_id: templateId,
        external_user_id: externalUserId,
        source: "gateway-template",
      }),
      tools: null,
      bindings: null,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .execute();

  return id;
}

export const GATEWAY_TEMPLATE_CREATE_SESSION: ServerPluginToolDefinition = {
  name: "GATEWAY_TEMPLATE_CREATE_SESSION",
  description:
    "Create a connect session URL for an external user. " +
    "Returns a URL that the user can visit to configure their integrations. " +
    "Also creates a unique Virtual MCP (agent) for this user if one doesn't exist.",
  inputSchema: GatewayTemplateCreateSessionInputSchema,
  outputSchema: GatewayTemplateCreateSessionOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof GatewayTemplateCreateSessionInputSchema
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
