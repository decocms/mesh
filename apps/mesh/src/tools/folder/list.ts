/**
 * FOLDER_LIST Tool
 *
 * List all folders in an organization by type.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { FolderEntitySchema, FolderTypeSchema } from "./schema";

/**
 * Input schema for listing folders
 */
const ListInputSchema = z.object({
  type: FolderTypeSchema.describe("Type of folders to list"),
});

/**
 * Output schema for folder list
 */
const ListOutputSchema = z.object({
  items: z.array(FolderEntitySchema).describe("List of folders"),
});

export const FOLDER_LIST = defineTool({
  name: "FOLDER_LIST",
  description: "List all folders of a specific type in the organization",

  inputSchema: ListInputSchema,
  outputSchema: ListOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const folders = await ctx.storage.folders.list(organization.id, input.type);

    return {
      items: folders.map((folder) => ({
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
      })),
    };
  },
});
