/**
 * COLLECTION_TOOLS_LIST Tool
 *
 * List all stored tools in the organization with collection binding compliance.
 */

import {
  CollectionListInputSchema,
  createCollectionListOutputSchema,
} from "@decocms/bindings/collections";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import {
  applyOrderBy,
  evaluateWhereExpression,
} from "../collections/list-utils";
import { ToolEntitySchema, type ToolEntity } from "./schema";

const ListInputSchema = CollectionListInputSchema;
const ListOutputSchema = createCollectionListOutputSchema(ToolEntitySchema);

export const COLLECTION_TOOLS_LIST = defineTool({
  name: "COLLECTION_TOOLS_LIST",
  description: "List stored tools in the organization",
  inputSchema: ListInputSchema,
  outputSchema: ListOutputSchema,
  handler: async (input, ctx) => {
    await ctx.access.check();
    const organization = requireOrganization(ctx);

    let items: ToolEntity[] = await ctx.storage.tools.list(organization.id);

    if (input.where) {
      items = items.filter((item) =>
        evaluateWhereExpression(item, input.where!),
      );
    }

    if (input.orderBy && input.orderBy.length > 0) {
      items = applyOrderBy(items, input.orderBy);
    }

    const totalCount = items.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginated = items.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      items: paginated,
      totalCount,
      hasMore,
    };
  },
});
