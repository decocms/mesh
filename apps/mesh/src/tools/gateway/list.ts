/**
 * COLLECTION_GATEWAY_LIST Tool
 *
 * List all gateways for the organization with collection binding compliance.
 */

import {
  CollectionListInputSchema,
  createCollectionListOutputSchema,
  type OrderByExpression,
  type WhereExpression,
} from "@decocms/bindings/collections";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import { type GatewayEntity, GatewayEntitySchema } from "./schema";

/**
 * Convert SQL LIKE pattern to regex pattern by tokenizing.
 * Handles % (any chars) and _ (single char) wildcards.
 */
function convertLikeToRegex(likePattern: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < likePattern.length) {
    const char = likePattern[i] as string;
    if (char === "%") {
      result.push(".*");
    } else if (char === "_") {
      result.push(".");
    } else if (/[.*+?^${}()|[\]\\]/.test(char)) {
      // Escape regex special characters
      result.push("\\" + char);
    } else {
      result.push(char);
    }
    i++;
  }

  return result.join("");
}

function isStringOrValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Get a field value from a gateway, handling nested paths.
 */
function getFieldValue(gateway: GatewayEntity, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let value: unknown = gateway;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function gatewayHasConnectionId(gateway: GatewayEntity, connectionId: string) {
  return gateway.connections.some((c) => c.connection_id === connectionId);
}

/**
 * Evaluate a where expression against a gateway entity.
 *
 * Note: we support a special field `connection_id` that matches gateways that
 * include a connection with that id (via gateway.connections[*].connection_id).
 */
function evaluateWhereExpression(
  gateway: GatewayEntity,
  where: WhereExpression,
): boolean {
  if ("conditions" in where) {
    const { operator, conditions } = where;
    switch (operator) {
      case "and":
        return conditions.every((c) => evaluateWhereExpression(gateway, c));
      case "or":
        return conditions.some((c) => evaluateWhereExpression(gateway, c));
      case "not":
        return !conditions.every((c) => evaluateWhereExpression(gateway, c));
      default:
        return true;
    }
  }

  const { field, operator, value } = where;
  const fieldPath = field.join(".");

  if (fieldPath === "connection_id") {
    if (operator !== "eq" || typeof value !== "string") return false;
    return gatewayHasConnectionId(gateway, value);
  }

  const fieldValue = getFieldValue(gateway, fieldPath);

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
    case "like":
      if (typeof fieldValue !== "string" || typeof value !== "string") {
        return false;
      }
      // Limit pattern length to prevent ReDoS
      if (value.length > 100) return false;
      const pattern = convertLikeToRegex(value);
      return new RegExp(`^${pattern}$`, "i").test(fieldValue);
    case "contains":
      if (typeof fieldValue !== "string" || typeof value !== "string") {
        return false;
      }
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    default:
      return true;
  }
}

function applyOrderBy(
  items: GatewayEntity[],
  orderBy: OrderByExpression[],
): GatewayEntity[] {
  return [...items].sort((a, b) => {
    for (const order of orderBy) {
      const fieldPath = order.field.join(".");
      const aValue = getFieldValue(a, fieldPath);
      const bValue = getFieldValue(b, fieldPath);

      let comparison = 0;

      // Handle nulls
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
 * Input schema for listing gateways (collection-binding-compliant)
 */
const ListInputSchema = CollectionListInputSchema;

export type ListGatewaysInput = z.infer<typeof ListInputSchema>;

/**
 * Output schema for gateway list
 */
const ListOutputSchema = createCollectionListOutputSchema(GatewayEntitySchema);

export const COLLECTION_GATEWAY_LIST = defineTool({
  name: "COLLECTION_GATEWAY_LIST",
  description: "List all MCP gateways in the organization",

  inputSchema: ListInputSchema,
  outputSchema: ListOutputSchema,

  handler: async (input, ctx) => {
    await ctx.access.check();
    const organization = requireOrganization(ctx);

    // Fast-path: if the where clause includes connection_id eq, prefilter using the DB index.
    // We still apply the full `where` expression afterwards (in case other conditions exist).
    const connectionIdEq =
      input.where &&
      !("conditions" in input.where) &&
      input.where.field.join(".") === "connection_id" &&
      input.where.operator === "eq" &&
      typeof input.where.value === "string"
        ? input.where.value
        : undefined;

    const gateways = connectionIdEq
      ? await ctx.storage.gateways.listByConnectionId(
          organization.id,
          connectionIdEq,
        )
      : await ctx.storage.gateways.list(organization.id);

    let filtered: GatewayEntity[] = gateways.map((gateway) => ({
      id: gateway.id,
      title: gateway.title,
      description: gateway.description,
      icon: gateway.icon,
      organization_id: gateway.organizationId,
      tool_selection_mode: gateway.toolSelectionMode,
      status: gateway.status,
      connections: gateway.connections.map((conn) => ({
        connection_id: conn.connectionId,
        selected_tools: conn.selectedTools,
        selected_resources: conn.selectedResources,
        selected_prompts: conn.selectedPrompts,
      })),
      created_at: gateway.createdAt as string,
      updated_at: gateway.updatedAt as string,
      created_by: gateway.createdBy,
      updated_by: gateway.updatedBy ?? undefined,
    }));

    // Apply where filter if specified
    if (input.where) {
      filtered = filtered.filter((gw) =>
        evaluateWhereExpression(gw, input.where!),
      );
    }

    // Apply orderBy if specified
    if (input.orderBy && input.orderBy.length > 0) {
      filtered = applyOrderBy(filtered, input.orderBy);
    }

    // Calculate pagination
    const totalCount = filtered.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginated = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      items: paginated,
      totalCount,
      hasMore,
    };
  },
});
