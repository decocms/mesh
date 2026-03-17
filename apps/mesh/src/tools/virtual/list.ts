/**
 * VIRTUAL_MCP_LIST Tool
 *
 * List all virtual MCPs for the organization with collection binding compliance.
 */

import {
  CollectionListInputSchema,
  applyOrderBy,
  createCollectionListOutputSchema,
  evaluateWhereExpression,
  resolveCollectionListInput,
} from "@decocms/bindings/collections";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import { type VirtualMCPEntity, VirtualMCPEntitySchema } from "./schema";

function virtualMcpHasConnectionId(
  virtualMcp: VirtualMCPEntity,
  connectionId: string,
) {
  return virtualMcp.connections.some((c) => c.connection_id === connectionId);
}

/**
 * Wrapper around the shared evaluateWhereExpression that handles the
 * special `connection_id` virtual field for virtual MCPs.
 */
function evaluateVirtualMcpWhere(
  virtualMcp: VirtualMCPEntity,
  where: import("@decocms/bindings/collections").WhereExpression,
): boolean {
  if ("conditions" in where) {
    const { operator, conditions } = where;
    switch (operator) {
      case "and":
        return conditions.every((c) => evaluateVirtualMcpWhere(virtualMcp, c));
      case "or":
        return conditions.some((c) => evaluateVirtualMcpWhere(virtualMcp, c));
      case "not":
        return !conditions.every((c) => evaluateVirtualMcpWhere(virtualMcp, c));
      default:
        return true;
    }
  }

  const { field, operator, value } = where;
  const fieldPath = field.join(".");

  // Special handling for connection_id field
  if (fieldPath === "connection_id") {
    if (operator !== "eq" || typeof value !== "string") return false;
    return virtualMcpHasConnectionId(virtualMcp, value);
  }

  // Delegate to the shared utility for standard fields
  return evaluateWhereExpression(
    virtualMcp as unknown as Record<string, unknown>,
    where,
  );
}

/**
 * Input schema for listing virtual MCPs (collection-binding-compliant)
 */
const ListInputSchema = CollectionListInputSchema;

export type ListVirtualMCPsInput = z.infer<typeof ListInputSchema>;

/**
 * Output schema for virtual MCP list
 */
const ListOutputSchema = createCollectionListOutputSchema(
  VirtualMCPEntitySchema,
);

export const VIRTUAL_MCP_LIST = defineTool({
  name: "VIRTUAL_MCP_LIST",
  description:
    "List Virtual MCPs. Use 'search' to find by name/description, 'sort' for ordering (newest, oldest, a-z, z-a).",
  annotations: {
    title: "List Virtual MCPs",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: ListInputSchema,
  outputSchema: ListOutputSchema,

  handler: async (input, ctx) => {
    await ctx.access.check();
    const organization = requireOrganization(ctx);

    // Resolve simple search/sort params into where/orderBy
    const resolved = resolveCollectionListInput(input);

    // Fast-path: if the where clause includes connection_id eq, prefilter using the DB index.
    // We still apply the full `where` expression afterwards (in case other conditions exist).
    const connectionIdEq =
      resolved.where &&
      !("conditions" in resolved.where) &&
      resolved.where.field.join(".") === "connection_id" &&
      resolved.where.operator === "eq" &&
      typeof resolved.where.value === "string"
        ? resolved.where.value
        : undefined;

    const virtualMcps = connectionIdEq
      ? await ctx.storage.virtualMcps.listByConnectionId(
          organization.id,
          connectionIdEq,
        )
      : await ctx.storage.virtualMcps.list(organization.id);

    // Virtual MCPs are already in VirtualMCPEntity format (snake_case)
    let filtered: VirtualMCPEntity[] = virtualMcps;

    // Apply where filter if specified
    if (resolved.where) {
      filtered = filtered.filter((vm) =>
        evaluateVirtualMcpWhere(vm, resolved.where!),
      );
    }

    // Apply orderBy if specified
    if (resolved.orderBy && resolved.orderBy.length > 0) {
      filtered = applyOrderBy(
        filtered as unknown as Record<string, unknown>[],
        resolved.orderBy,
      ) as unknown as VirtualMCPEntity[];
    }

    // Calculate pagination
    const totalCount = filtered.length;
    const offset = resolved.offset ?? 0;
    const limit = resolved.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      items: paginated,
      totalCount,
      hasMore,
    };
  },
});
