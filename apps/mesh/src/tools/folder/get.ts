/**
 * FOLDER_GET Tool
 *
 * Get a folder by ID.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { FolderEntitySchema } from "./schema";

/**
 * Input schema for getting a folder
 */
const GetInputSchema = z.object({
  id: z.string().describe("Folder ID"),
});

/**
 * Output schema for folder
 */
const GetOutputSchema = z.object({
  item: FolderEntitySchema.nullable().describe(
    "The folder entity or null if not found",
  ),
});

export const FOLDER_GET = defineTool({
  name: "FOLDER_GET",
  description: "Get a folder by ID",

  inputSchema: GetInputSchema,
  outputSchema: GetOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);

    await ctx.access.check();

    const folder = await ctx.storage.folders.findById(input.id);

    if (!folder) {
      return { item: null };
    }

    return {
      item: {
        id: folder.id,
        type: folder.type,
        title: folder.title,
        description: folder.description,
        icon: folder.icon,
        color: folder.color,
        sort_order: folder.sortOrder,
        created_at: folder.createdAt as string,
        updated_at: folder.updatedAt as string,
        created_by: folder.createdBy,
        organization_id: folder.organizationId,
      },
    };
  },
});
