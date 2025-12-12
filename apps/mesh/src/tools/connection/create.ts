/**
 * COLLECTION_CONNECTIONS_CREATE Tool
 *
 * Create a new MCP connection (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ConnectionEntitySchema, ConnectionCreateDataSchema } from "./schema";
import { fetchToolsFromMCP } from "./fetch-tools";

/**
 * Input schema for creating connections (wrapped in data field for collection compliance)
 */
const CreateInputSchema = z.object({
  data: ConnectionCreateDataSchema.describe(
    "Data for the new connection (id is auto-generated if not provided)",
  ),
});

export type CreateConnectionInput = z.infer<typeof CreateInputSchema>;
/**
 * Output schema for created connection
 */
const CreateOutputSchema = z.object({
  item: ConnectionEntitySchema.describe("The created connection entity"),
});

export const COLLECTION_CONNECTIONS_CREATE = defineTool({
  name: "COLLECTION_CONNECTIONS_CREATE",
  description: "Create a new MCP connection in the organization",

  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create connection");
    }

    // Build connection data
    const connectionData = {
      ...input.data,
      organization_id: organization.id,
      created_by: userId,
    };

    // Fetch tools from the MCP server before creating the connection
    const fetchedTools = await fetchToolsFromMCP({
      id: "pending",
      title: connectionData.title,
      connection_url: connectionData.connection_url,
      connection_token: connectionData.connection_token,
      connection_headers: connectionData.connection_headers,
    }).catch(() => null);
    const tools = fetchedTools?.length ? fetchedTools : null;

    // Create the connection with the fetched tools
    const connection = await ctx.storage.connections.create({
      ...connectionData,
      tools,
    });

    return {
      item: connection,
    };
  },
});
