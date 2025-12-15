/**
 * CONNECTION_CONFIGURE Tool
 *
 * Configure connection state and scopes for MCP cross-connection dependencies.
 * This allows MCPs to declare their configuration needs and reference other connections.
 */

import { WellKnownMCPId } from "@/core/well-known-mcp";
import { z } from "zod";
import { createMCPProxy } from "../../api/routes/proxy";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";

/**
 * Input schema for CONNECTION_CONFIGURE
 */
const ConfigureInputSchema = z.object({
  connectionId: z.string().describe("ID of the connection to configure"),
  state: z
    .record(z.unknown())
    .describe(
      "Configuration state (can contain cross-MCP references in format { KEY: { value: 'conn_...', type: '...' } })",
    ),
  scopes: z
    .array(z.string())
    .describe(
      "Array of scopes in format 'KEY::SCOPE' (e.g., 'GMAIL::GetCurrentUser')",
    ),
});

/**
 * Output schema for CONNECTION_CONFIGURE
 */
const ConfigureOutputSchema = z.object({
  success: z.boolean().describe("Whether configuration was successful"),
  connectionId: z.string().describe("ID of the configured connection"),
  configuredScopes: z.array(z.string()).describe("Scopes that were configured"),
});

function parseScope(scope: string): [string, string] {
  const parts = scope.split("::");
  if (
    parts.length !== 2 ||
    typeof parts[0] !== "string" ||
    typeof parts[1] !== "string"
  ) {
    throw new Error(
      `Invalid scope format: ${scope}. Expected format: "KEY::SCOPE"`,
    );
  }
  return parts as [string, string];
}

export const CONNECTION_CONFIGURE = defineTool({
  name: "CONNECTION_CONFIGURE",
  description:
    "Configure connection state and scopes for cross-MCP dependencies",

  inputSchema: ConfigureInputSchema,
  outputSchema: ConfigureOutputSchema,

  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Require organization context
    const organization = requireOrganization(ctx);

    // Check authorization for this tool
    await ctx.access.check();

    const { connectionId, state, scopes } = input;

    // Verify connection exists and belongs to organization
    const connection = await ctx.storage.connections.findById(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (connection.organization_id !== organization.id) {
      throw new Error(
        `Connection ${connectionId} does not belong to organization ${organization.id}`,
      );
    }

    // Parse scopes to extract cross-MCP references and validate them
    // Format: "KEY::SCOPE" where KEY is a key in the state object
    // and state[KEY].value contains a connection ID
    const referencedConnections = new Set<string>();

    for (const scope of scopes) {
      // Parse scope format: "KEY::SCOPE"
      const [key] = parseScope(scope);

      // Check if this key exists in state
      if (!(key in state)) {
        throw new Error(
          `Scope references key "${key}" but it's not present in state`,
        );
      }

      // Extract connection ID from state
      const stateValue = state[key];
      if (
        typeof stateValue === "object" &&
        stateValue !== null &&
        "value" in stateValue
      ) {
        const connectionIdRef = (stateValue as { value: unknown }).value;
        if (typeof connectionIdRef === "string") {
          referencedConnections.add(connectionIdRef);
        }
      }
    }

    // Validate all referenced connections
    for (const refConnectionId of referencedConnections) {
      if (refConnectionId === WellKnownMCPId.SELF) {
        continue;
      }
      // Verify connection exists
      const refConnection =
        await ctx.storage.connections.findById(refConnectionId);
      if (!refConnection) {
        throw new Error(`Referenced connection not found: ${refConnectionId}`);
      }

      // Verify connection belongs to same organization
      if (refConnection.organization_id !== organization.id) {
        throw new Error(
          `Referenced connection ${refConnectionId} does not belong to organization ${organization.id}`,
        );
      }

      // Verify user has access to the referenced connection
      // This checks if the user has permission to access this connection
      // by checking the "conn_<UUID>" resource in their permissions
      try {
        await ctx.access.check(refConnectionId);
      } catch (error) {
        throw new Error(
          `Access denied to referenced connection: ${refConnectionId}. ${
            (error as Error).message
          }`,
        );
      }
    }

    // Store configuration state and scopes
    await ctx.storage.connections.update(connectionId, {
      configuration_state: state,
      configuration_scopes: scopes,
    });

    // Invoke ON_MCP_CONFIGURATION callback on the connection
    // Ignore errors but await for the response before responding
    try {
      const proxy = await createMCPProxy(connectionId, ctx);
      await proxy.client.callTool({
        name: "ON_MCP_CONFIGURATION",
        arguments: { state, scopes },
      });
    } catch (error) {
      console.error("Failed to invoke ON_MCP_CONFIGURATION callback", error);
    }

    return {
      success: true,
      connectionId,
      configuredScopes: scopes,
    };
  },
});
