/**
 * FOLDER_UPDATE Tool
 *
 * Update an existing folder.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { FolderUpdateDataSchema, FolderEntitySchema } from "./schema";

/**
 * Input schema for updating a folder
 */
const UpdateInputSchema = z.object({
  id: z.string().describe("Folder ID"),
  data: FolderUpdateDataSchema.describe("Update data"),
});

/**
 * Output schema for updated folder
 */
const UpdateOutputSchema = z.object({
  item: FolderEntitySchema.describe("The updated folder entity"),
});

export const FOLDER_UPDATE = defineTool({
  name: "FOLDER_UPDATE",
  description: "Update an existing folder",

  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);

    await ctx.access.check();

    const folder = await ctx.storage.folders.update(input.id, {
      title: input.data.title,
      description: input.data.description,
      icon: input.data.icon,
      color: input.data.color,
      sortOrder: input.data.sort_order,
    });

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
