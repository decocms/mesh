/**
 * FOLDER_DELETE Tool
 *
 * Delete a folder. Items in the folder are moved to the root level.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

/**
 * Input schema for deleting a folder
 */
const DeleteInputSchema = z.object({
  id: z.string().describe("Folder ID to delete"),
});

/**
 * Output schema for delete result
 */
const DeleteOutputSchema = z.object({
  success: z.boolean().describe("Whether the deletion was successful"),
});

export const FOLDER_DELETE = defineTool({
  name: "FOLDER_DELETE",
  description:
    "Delete a folder. Connections and gateways in the folder are moved to the root level.",

  inputSchema: DeleteInputSchema,
  outputSchema: DeleteOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);

    await ctx.access.check();

    await ctx.storage.folders.delete(input.id);

    return { success: true };
  },
});
