/**
 * COLLECTION_VIRTUAL_MCP_CREATE Tool
 *
 * Create a new MCP virtual MCP (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { VirtualMCPCreateDataSchema, VirtualMCPEntitySchema } from "./schema";

/**
 * Input schema for creating virtual MCPs (wrapped in data field for collection compliance)
 */
const CreateInputSchema = z.object({
  data: VirtualMCPCreateDataSchema.describe("Data for the new virtual MCP"),
});

export type CreateVirtualMCPInput = z.infer<typeof CreateInputSchema>;

/**
 * Output schema for created virtual MCP
 */
const CreateOutputSchema = z.object({
  item: VirtualMCPEntitySchema.describe("The created virtual MCP entity"),
});

export const COLLECTION_VIRTUAL_MCP_CREATE = defineTool({
  name: "COLLECTION_VIRTUAL_MCP_CREATE",
  description: "Create a new MCP virtual MCP in the organization",

  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create virtual MCP");
    }

    // Create the virtual MCP (input.data is already in the correct format)
    const virtualMcp = await ctx.storage.virtualMcps.create(
      organization.id,
      userId,
      input.data,
    );

    // Return virtual MCP entity directly (already in correct format)
    return {
      item: virtualMcp,
    };
  },
});
