/**
 * COLLECTION_THREADS_LIST Tool
 *
 * List all threads in the organization with collection binding compliance.
 * Supports filtering, sorting, and pagination.
 */

import {
  CollectionListInputSchema,
  createCollectionListOutputSchema,
  type OrderByExpression,
  type WhereExpression,
} from "@decocms/bindings/collections";
import type { Thread } from "@/storage/types";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import { ThreadEntitySchema } from "./schema";

function isStringOrValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Evaluate a where expression against a thread entity
 */
function evaluateWhereExpression(
  thread: Thread,
  where: WhereExpression,
): boolean {
  if ("conditions" in where) {
    const { operator, conditions } = where;
    switch (operator) {
      case "and":
        return conditions.every((c) => evaluateWhereExpression(thread, c));
      case "or":
        return conditions.some((c) => evaluateWhereExpression(thread, c));
      case "not":
        return !conditions.every((c) => evaluateWhereExpression(thread, c));
      default:
        return true;
    }
  }

  const { field, operator, value } = where;
  const fieldPath = field.join(".");
  const fieldValue = getFieldValue(thread, fieldPath);

  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "gt":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue > value
      );
    case "gte":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue >= value
      );
    case "lt":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue < value
      );
    case "lte":
      return (
        isStringOrValue(fieldValue) &&
        isStringOrValue(value) &&
        fieldValue <= value
      );
    case "in":
      return Array.isArray(value) && value.includes(fieldValue);
    case "contains":
      if (typeof fieldValue !== "string" || typeof value !== "string") {
        return false;
      }
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    default:
      return true;
  }
}

/**
 * Get a field value from a thread, handling nested paths
 */
function getFieldValue(thread: Thread, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let value: unknown = thread;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/**
 * Apply orderBy expressions to sort threads
 */
function applyOrderBy(
  threads: Thread[],
  orderBy: OrderByExpression[],
): Thread[] {
  return [...threads].sort((a, b) => {
    for (const order of orderBy) {
      const fieldPath = order.field.join(".");
      const aValue = getFieldValue(a, fieldPath);
      const bValue = getFieldValue(b, fieldPath);

      let comparison = 0;

      if (aValue == null && bValue == null) continue;
      if (aValue == null) {
        comparison = order.nulls === "first" ? -1 : 1;
      } else if (bValue == null) {
        comparison = order.nulls === "first" ? 1 : -1;
      } else if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      if (comparison !== 0) {
        return order.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

/**
 * Output schema using the ThreadEntitySchema
 */
const ThreadListOutputSchema =
  createCollectionListOutputSchema(ThreadEntitySchema);

export const COLLECTION_THREADS_LIST = defineTool({
  name: "COLLECTION_THREADS_LIST",
  description:
    "List all threads in the organization with filtering, sorting, and pagination",

  inputSchema: CollectionListInputSchema,
  outputSchema: ThreadListOutputSchema,

  handler: async (input, ctx) => {
    await ctx.access.check();

    const organization = requireOrganization(ctx);

    const { threads } = await ctx.storage.threads.list(organization.id);

    let filteredThreads = threads;

    // Apply where filter if specified
    if (input.where) {
      filteredThreads = filteredThreads.filter((thread) =>
        evaluateWhereExpression(thread, input.where!),
      );
    }

    // Apply orderBy if specified
    if (input.orderBy && input.orderBy.length > 0) {
      filteredThreads = applyOrderBy(filteredThreads, input.orderBy);
    }

    // Calculate pagination
    const totalCount = filteredThreads.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginatedThreads = filteredThreads.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      items: paginatedThreads,
      totalCount,
      hasMore,
    };
  },
});
