/**
 * COLLECTION_THREADS_CREATE Tool
 *
 * Create a new thread (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ThreadCreateDataSchema, ThreadEntitySchema } from "./schema";
import {
  generatePrefixedId,
  idMatchesPrefix,
} from "@/shared/utils/generate-id";

/**
 * Input schema for creating threads (wrapped in data field for collection compliance)
 */
const CreateInputSchema = z.object({
  data: ThreadCreateDataSchema.describe(
    "Data for the new thread (id is auto-generated if not provided)",
  ),
});

export type CreateThreadInput = z.infer<typeof CreateInputSchema>;

/**
 * Output schema for created thread
 */
const CreateOutputSchema = z.object({
  item: ThreadEntitySchema.describe("The created thread entity"),
});

export const COLLECTION_THREADS_CREATE = defineTool({
  name: "COLLECTION_THREADS_CREATE",
  description: "Create a new thread in the organization",

  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create thread");
    }

    let threadId = null;
    if (input.data.id && idMatchesPrefix(input.data.id, "thrd")) {
      threadId = input.data.id;
    } else {
      threadId = generatePrefixedId("thrd");
    }

    const result = await ctx.storage.threads.create({
      id: threadId,
      organizationId: organization.id,
      title: input.data.title,
      description: input.data.description,
      createdBy: userId,
    });

    return {
      item: result,
    };
  },
});
