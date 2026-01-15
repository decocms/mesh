/**
 * COLLECTION_RESOURCES_LIST Tool
 *
 * List all stored resources in the organization with collection binding compliance.
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
import { ResourceEntitySchema, type ResourceEntity } from "./schema";

const ListInputSchema = CollectionListInputSchema;
const ListOutputSchema = createCollectionListOutputSchema(ResourceEntitySchema);

export const COLLECTION_RESOURCES_LIST = defineTool({
  name: "COLLECTION_RESOURCES_LIST",
  description: "List stored resources in the organization",
  inputSchema: ListInputSchema,
  outputSchema: ListOutputSchema,
  handler: async (input, ctx) => {
    await ctx.access.check();
    const organization = requireOrganization(ctx);

    let items: ResourceEntity[] = await ctx.storage.resources.list(
      organization.id,
    );

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
