/**
 * FOLDER_CREATE Tool
 *
 * Create a new folder for organizing connections and gateways.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { FolderCreateDataSchema, FolderEntitySchema } from "./schema";

/**
 * Input schema for creating folders
 */
const CreateInputSchema = z.object({
  data: FolderCreateDataSchema.describe("Data for the new folder"),
});

/**
 * Output schema for created folder
 */
const CreateOutputSchema = z.object({
  item: FolderEntitySchema.describe("The created folder entity"),
});

export const FOLDER_CREATE = defineTool({
  name: "FOLDER_CREATE",
  description:
    "Create a new folder for organizing MCP connections and gateways",

  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create folder");
    }

    const folder = await ctx.storage.folders.create(organization.id, userId, {
      type: input.data.type,
      title: input.data.title,
      description: input.data.description ?? null,
      icon: input.data.icon ?? null,
      color: input.data.color ?? null,
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
