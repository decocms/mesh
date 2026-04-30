/**
 * COLLECTION_THREADS_LIST Tool
 *
 * List all threads in the organization with collection binding compliance.
 * Supports filtering, sorting, and pagination.
 */

import {
  CollectionListInputSchema,
  createCollectionListOutputSchema,
} from "@decocms/bindings/collections";
import { ForbiddenError } from "../../core/access-control";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import { normalizeThreadForResponse } from "./helpers";
import { ThreadEntitySchema } from "./schema";
import { z } from "zod";

const ThreadListInputSchema = CollectionListInputSchema.extend({
  where: z
    .object({
      created_by: z.string().optional(),
      trigger_ids: z.array(z.string()).optional(),
      virtual_mcp_id: z.string().optional(),
      /** Show archived (hidden=true) threads instead of open ones */
      hidden: z.boolean().optional(),
      /** Filter by presence of a trigger_id (automation-owned) */
      has_trigger: z.boolean().optional(),
    })
    .optional(),
  startDate: z
    .string()
    .datetime()
    .optional()
    .describe("Filter threads updated at or after this ISO timestamp"),
  endDate: z
    .string()
    .datetime()
    .optional()
    .describe("Filter threads updated at or before this ISO timestamp"),
  search: z
    .string()
    .optional()
    .describe("Full-text search on thread title (case-insensitive)"),
  status: z
    .string()
    .optional()
    .describe("Filter by thread status (e.g. completed, failed, in_progress)"),
  userId: z
    .string()
    .optional()
    .describe(
      "Filter by the user who created the thread. Members without the `THREADS_VIEW_ALL_MEMBERS` capability can only filter by their own user id; passing a different id will raise a permission error.",
    ),
  agentId: z
    .string()
    .optional()
    .describe("Filter by agent (connection or virtual MCP) ID"),
});

/**
 * Output schema using the ThreadEntitySchema
 */
const ThreadListOutputSchema =
  createCollectionListOutputSchema(ThreadEntitySchema);

export const COLLECTION_THREADS_LIST = defineTool({
  name: "COLLECTION_THREADS_LIST",
  description: "List threads with filtering, sorting, and pagination.",
  annotations: {
    title: "List Threads",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: ThreadListInputSchema,
  outputSchema: ThreadListOutputSchema,

  handler: async (input, ctx) => {
    await ctx.access.check();
    const userId = ctx.auth.user?.id;
    if (!userId) {
      throw new Error("User ID required to list threads");
    }
    requireOrganization(ctx);
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;

    const triggerIds = input.where?.trigger_ids;
    const virtualMcpId = input.where?.virtual_mcp_id;
    // "me" is a reserved value meaning "filter by the authenticated user"
    const requestedCreatedBy =
      input.userId ??
      (input.where?.created_by === "me" ? userId : input.where?.created_by);

    // Members without `threads:view-all` may only filter by their own user
    // id (or omit the filter, which we then default to "self"). Asking for
    // someone else's threads is a permission error rather than a silent
    // override — silent overrides made it look like the API was returning
    // empty results when the caller mistyped a userId.
    const canViewAll = await ctx.access.has("THREADS_VIEW_ALL_MEMBERS");
    if (
      !canViewAll &&
      requestedCreatedBy !== undefined &&
      requestedCreatedBy !== userId
    ) {
      throw new ForbiddenError(
        "You don't have permission to list other members' threads. Ask an organization admin to grant the 'View other members' threads' capability if you need it.",
      );
    }
    const createdBy = canViewAll ? requestedCreatedBy : userId;

    const { threads, total } = triggerIds?.length
      ? await ctx.storage.threads.listByTriggerIds(triggerIds, {
          limit,
          offset,
        })
      : await ctx.storage.threads.list(createdBy, {
          limit,
          offset,
          virtualMcpId,
          startDate: input.startDate,
          endDate: input.endDate,
          search: input.search,
          status: input.status,
          agentId: input.agentId,
          includeArchived: input.where?.hidden,
          hasTrigger: input.where?.has_trigger,
        });

    const hasMore = offset + limit < total;

    const now = Date.now();

    return {
      items: threads.map((thread) => normalizeThreadForResponse(thread, now)),
      totalCount: total,
      hasMore,
    };
  },
});
