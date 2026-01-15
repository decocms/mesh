/**
 * COLLECTION_THREAD_MESSAGES_LIST Tool
 *
 * List all messages for a specific thread.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import { ThreadMessageEntitySchema } from "./schema";

/**
 * Input schema for listing thread messages
 */
const ListMessagesInputSchema = z.object({
  threadId: z.string().describe("ID of the thread to list messages for"),
  limit: z.number().optional().describe("Maximum number of messages to return"),
  offset: z.number().optional().describe("Number of messages to skip"),
});

/**
 * Output schema for thread messages list
 */
const ListMessagesOutputSchema = z.object({
  items: z.array(ThreadMessageEntitySchema).describe("List of thread messages"),
  totalCount: z.number().describe("Total number of messages in the thread"),
  hasMore: z.boolean().describe("Whether there are more messages available"),
});

export const COLLECTION_THREAD_MESSAGES_LIST = defineTool({
  name: "COLLECTION_THREAD_MESSAGES_LIST",
  description: "List all messages for a specific thread",

  inputSchema: ListMessagesInputSchema,
  outputSchema: ListMessagesOutputSchema,

  handler: async (input, ctx) => {
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    // First verify the thread exists and belongs to the organization
    const thread = await ctx.storage.threads.get(input.threadId);
    if (!thread || thread.organizationId !== organization.id) {
      throw new Error("Thread not found in organization");
    }

    const messages = await ctx.storage.threads.listMessages(input.threadId);

    // Apply pagination
    const totalCount = messages.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginatedMessages = messages.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      items: paginatedMessages,
      totalCount,
      hasMore,
    };
  },
});
