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
import {
  ThreadCreateDataSchema,
  ThreadEntitySchema,
  ThreadMessageEntitySchema,
} from "./schema";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { ThreadMessage } from "@/storage/types";

/**
 * Input schema for creating threads (wrapped in data field for collection compliance)
 */
const CreateInputSchema = z.object({
  data: ThreadCreateDataSchema.extend({
    messages: z
      .array(ThreadMessageEntitySchema)
      .optional()
      .describe("Messages for the new thread"),
  }).describe("Data for the new thread (id is auto-generated if not provided)"),
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

    const threadId = input.data.id ?? generatePrefixedId("thrd");

    const messages = input.data.messages ?? [];

    if (messages.length > 0) {
      const result = await ctx.storage.threads.createWithMessages({
        id: threadId,
        organizationId: organization.id,
        title: input.data.title,
        description: input.data.description,
        createdBy: userId,
        messages: messages as unknown as ThreadMessage[],
      });
      return {
        item: {
          ...result,
          hidden: result.hidden ?? false,
        },
      };
    }

    const result = await ctx.storage.threads.create({
      id: threadId,
      organizationId: organization.id,
      title: input.data.title,
      description: input.data.description,
      createdBy: userId,
    });

    return {
      item: {
        ...result,
        hidden: result.hidden ?? false,
      },
    };
  },
});
