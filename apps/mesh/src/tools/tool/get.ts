/**
 * COLLECTION_TOOLS_GET Tool
 *
 * Get a stored tool by ID with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ToolEntitySchema } from "./schema";

const GetInputSchema = z.object({
  id: z.string().describe("ID of the tool to retrieve"),
});

const GetOutputSchema = z.object({
  item: ToolEntitySchema.nullable().describe(
    "The retrieved tool, or null if not found",
  ),
});

export const COLLECTION_TOOLS_GET = defineTool({
  name: "COLLECTION_TOOLS_GET",
  description: "Get a stored tool by ID",
  inputSchema: GetInputSchema,
  outputSchema: GetOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const tool = await ctx.storage.tools.findById(input.id);
    if (tool && tool.organization_id !== organization.id) {
      return { item: null };
    }
    return { item: tool ?? null };
  },
});
