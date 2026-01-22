/**
 * Collection Hooks using React Query
 *
 * Provides React hooks for working with collection-binding-compliant tools.
 * Uses TanStack React Query for caching, loading states, and mutations.
 */

import {
  type BaseCollectionEntity,
  type CollectionDeleteInput,
  type CollectionDeleteOutput,
  type CollectionGetOutput,
  type CollectionInsertInput,
  type CollectionInsertOutput,
  type CollectionListInput,
  type CollectionListOutput,
  type CollectionUpdateInput,
  type CollectionUpdateOutput,
  type OrderByExpression,
  type WhereExpression,
} from "@decocms/bindings/collections";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useMCPToolCall } from "./use-mcp-tools";

/**
 * Collection entity base type that matches the collection binding pattern
 */
export type CollectionEntity = BaseCollectionEntity;

/**
 * Filter definition for collection queries (matches @deco/ui Filter shape)
 */
export interface CollectionFilter {
  /** Field to filter on (must match an entity property) */
  column: string;
  /** Value to match */
  value: string | boolean | number;
}

/**
 * Options for useCollectionList hook
 */
export interface UseCollectionListOptions<T extends CollectionEntity> {
  /** Text search term (searches configured searchable fields) */
  searchTerm?: string;
  /** Field filters */
  filters?: CollectionFilter[];
  /** Sort key (field to sort by) */
  sortKey?: keyof T;
  /** Sort direction */
  sortDirection?: "asc" | "desc" | null;
  /** Fields to search when searchTerm is provided (default: ["title", "description"]) */
  searchFields?: (keyof T)[];
  /** Default sort key when none provided */
  defaultSortKey?: keyof T;
  /** Page size for pagination (default: 100) */
  pageSize?: number;
}

/**
 * Build a where expression from search term and filters
 */
function buildWhereExpression<T extends CollectionEntity>(
  searchTerm: string | undefined,
  filters: CollectionFilter[] | undefined,
  searchFields: (keyof T)[],
): WhereExpression | undefined {
  const conditions: WhereExpression[] = [];

  // Add search conditions (OR)
  if (searchTerm?.trim()) {
    const trimmedSearchTerm = searchTerm.trim();
    const searchConditions = searchFields.map((field) => ({
      field: [String(field)],
      operator: "contains" as const,
      value: trimmedSearchTerm,
    }));

    if (searchConditions.length === 1 && searchConditions[0]) {
      conditions.push(searchConditions[0]);
    } else if (searchConditions.length > 1) {
      conditions.push({
        operator: "or",
        conditions: searchConditions,
      });
    }
  }

  // Add filter conditions (AND)
  if (filters && filters.length > 0) {
    for (const filter of filters) {
      conditions.push({
        field: [filter.column],
        operator: "eq" as const,
        value: filter.value,
      });
    }
  }

  if (conditions.length === 0) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  // Combine all conditions with AND
  return {
    operator: "and",
    conditions,
  };
}

/**
 * Build orderBy expression from sort key and direction
 */
function buildOrderByExpression<T extends CollectionEntity>(
  sortKey: keyof T | undefined,
  sortDirection: "asc" | "desc" | null | undefined,
  defaultSortKey: keyof T,
): OrderByExpression[] | undefined {
  const key = sortKey ?? defaultSortKey;
  const direction = sortDirection ?? "asc";

  return [
    {
      field: [String(key)],
      direction,
    },
  ];
}

/**
 * Extract payload from MCP tool result (handles structuredContent wrapper)
 */
function extractPayload<T>(result: unknown): T {
  const r = result as { structuredContent?: T } | T;
  if (r && typeof r === "object" && "structuredContent" in r) {
    return r.structuredContent as T;
  }
  return r as T;
}

/**
 * Get a single item by ID from a collection
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, virtualMcpId for virtual-mcp-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param itemId - The ID of the item to fetch
 * @param client - The MCP client used to call collection tools
 * @returns Suspense query result with the item
 */
export function useCollectionItem<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  itemId: string,
  client: Client | null,
) {
  void scopeKey; // Reserved for future use (e.g., cache scoping)
  const upperName = collectionName.toUpperCase();
  const getToolName = `COLLECTION_${upperName}_GET`;

  const { data } = useMCPToolCall({
    client,
    toolName: getToolName,
    toolArguments: { id: itemId },
    select: (result) => extractPayload<CollectionGetOutput<T>>(result),
    staleTime: 60_000,
  });

  return data.item;
}

/**
 * Get a paginated list of items from a collection
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, virtualMcpId for virtual-mcp-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param client - The MCP client used to call collection tools
 * @param options - Filter and configuration options
 * @returns Suspense query result with items array
 */
export function useCollectionList<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  client: Client | null,
  options: UseCollectionListOptions<T> = {},
) {
  void scopeKey; // Reserved for future use (e.g., cache scoping)
  const {
    searchTerm,
    filters,
    sortKey,
    sortDirection,
    searchFields = ["title", "description"] as (keyof T)[],
    defaultSortKey = "updated_at" as keyof T,
    pageSize = 100,
  } = options;

  const upperName = collectionName.toUpperCase();
  const listToolName = `COLLECTION_${upperName}_LIST`;

  const where = buildWhereExpression(searchTerm, filters, searchFields);
  const orderBy = buildOrderByExpression(
    sortKey,
    sortDirection,
    defaultSortKey,
  );

  const toolArguments: CollectionListInput = {
    ...(where && { where }),
    ...(orderBy && { orderBy }),
    limit: pageSize,
    offset: 0,
  };

  const { data } = useMCPToolCall({
    client,
    toolName: listToolName,
    toolArguments,
    select: (result) => {
      const payload = extractPayload<CollectionListOutput<T>>(result);
      return payload?.items ?? [];
    },
  });

  return data;
}

/**
 * Get mutation actions for create, update, and delete operations
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, virtualMcpId for virtual-mcp-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param client - The MCP client used to call collection tools
 * @returns Object with create, update, and delete mutation hooks
 */
export function useCollectionActions<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  client: Client | null,
) {
  void scopeKey; // Reserved for future use (e.g., cache scoping)
  const queryClient = useQueryClient();
  const upperName = collectionName.toUpperCase();
  const createToolName = `COLLECTION_${upperName}_CREATE`;
  const updateToolName = `COLLECTION_${upperName}_UPDATE`;
  const deleteToolName = `COLLECTION_${upperName}_DELETE`;

  // Invalidate all tool call queries for this collection
  const invalidateCollection = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        // Match mcpToolCall keys: ["mcp", "client", client, "tool-call", toolName, argsKey]
        if (key[0] !== "mcp" || key[1] !== "client" || key[3] !== "tool-call") {
          return false;
        }
        const toolName = key[4] as string;
        return toolName?.startsWith(`COLLECTION_${upperName}_`);
      },
    });
  };

  const create = useMutation({
    mutationFn: async (data: Partial<T>) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: createToolName,
        arguments: {
          data,
        } as CollectionInsertInput<T>,
      })) as { structuredContent?: unknown };
      const payload = extractPayload<CollectionInsertOutput<T>>(result);

      return payload.item;
    },
    onSuccess: () => {
      invalidateCollection();
      toast.success("Item created successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create item: ${message}`);
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<T> }) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: updateToolName,
        arguments: {
          id,
          data,
        } as CollectionUpdateInput<T>,
      })) as { structuredContent?: unknown };
      const payload = extractPayload<CollectionUpdateOutput<T>>(result);

      return payload.item;
    },
    onSuccess: () => {
      invalidateCollection();
      toast.success("Item updated successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update item: ${message}`);
    },
  });

  const delete_ = useMutation({
    mutationFn: async (id: string) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: deleteToolName,
        arguments: {
          id,
        } as CollectionDeleteInput,
      })) as { structuredContent?: unknown };
      const payload = extractPayload<CollectionDeleteOutput<T>>(result);

      return payload.item.id;
    },
    onSuccess: () => {
      invalidateCollection();
      toast.success("Item deleted successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete item: ${message}`);
    },
  });

  return {
    create,
    update,
    delete: delete_,
  };
}
