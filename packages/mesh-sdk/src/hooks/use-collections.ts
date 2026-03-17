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
  type CollectionGetInput,
  type CollectionGetOutput,
  type CollectionInsertInput,
  type CollectionInsertOutput,
  type CollectionListInput,
  type CollectionListOutput,
  type CollectionUpdateInput,
  type CollectionUpdateOutput,
  type SortPreset,
  type WhereExpression,
} from "@decocms/bindings/collections";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { KEYS } from "../lib/query-keys";

/**
 * Collection entity base type that matches the collection binding pattern
 * Note: id can be nullable for synthetic entities like Decopilot agent
 */
export type CollectionEntity = Omit<BaseCollectionEntity, "id"> & {
  id: string | null;
};

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
  /** Text search term (searches title and description) */
  searchTerm?: string;
  /** Sort preset */
  sort?: SortPreset;
  /** Field filters (converted to where clause internally) */
  filters?: CollectionFilter[];
  /** Page size for pagination (default: 100) */
  pageSize?: number;

  // Legacy options — kept for backward compatibility
  /** @deprecated Use `sort` preset instead */
  sortKey?: keyof T;
  /** @deprecated Use `sort` preset instead */
  sortDirection?: "asc" | "desc" | null;
  /** @deprecated Search fields are now always title + description */
  searchFields?: (keyof T)[];
  /** @deprecated Use `sort` preset instead */
  defaultSortKey?: keyof T;
}

/**
 * Query key type for collection list queries
 */
export type CollectionQueryKey = readonly [
  unknown,
  string,
  string,
  "collection",
  string,
  "list",
  string,
];

/**
 * Convert CollectionFilter[] to WhereExpression
 */
function filtersToWhere(filters: CollectionFilter[]): WhereExpression {
  const conditions: WhereExpression[] = filters.map((f) => ({
    field: [f.column],
    operator: "eq" as const,
    value: f.value,
  }));

  if (conditions.length === 1) return conditions[0]!;
  return { operator: "and" as const, conditions };
}

/**
 * Build tool arguments from UseCollectionListOptions
 */
function buildToolArguments<T extends CollectionEntity>(
  options: UseCollectionListOptions<T>,
): CollectionListInput {
  const {
    searchTerm,
    sort,
    filters,
    pageSize = 100,
    // Legacy fallback
    sortKey,
    sortDirection,
    defaultSortKey,
  } = options;

  const args: CollectionListInput = {
    limit: pageSize,
    offset: 0,
  };

  // Simple search param
  if (searchTerm?.trim()) {
    args.search = searchTerm.trim();
  }

  // Sort: prefer new preset, fall back to legacy sortKey/sortDirection
  if (sort) {
    args.sort = sort;
  } else if (sortKey || defaultSortKey) {
    const key = sortKey ?? defaultSortKey;
    const direction = sortDirection ?? "asc";
    args.orderBy = [{ field: [String(key)], direction }];
  }

  // Filters → where
  if (filters && filters.length > 0) {
    const filterWhere = filtersToWhere(filters);
    args.where = filterWhere;
  }

  return args;
}

/**
 * Extract payload from MCP tool result (handles structuredContent wrapper)
 */
function extractPayload<T>(result: unknown): T {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid result");
  }

  if ("isError" in result && result.isError) {
    throw new Error(
      "content" in result &&
        Array.isArray(result.content) &&
        result.content[0]?.type === "text"
        ? result.content[0].text
        : "Unknown error",
    );
  }

  if ("structuredContent" in result) {
    return result.structuredContent as T;
  }

  throw new Error("No structured content found");
}

/**
 * Get a single item by ID from a collection
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, virtualMcpId for virtual-mcp-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param itemId - The ID of the item to fetch (undefined returns null without making an API call)
 * @param client - The MCP client used to call collection tools
 * @returns Suspense query result with the item, or null if itemId is undefined
 */
export function useCollectionItem<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  itemId: string | undefined,
  client: Client,
) {
  const upperName = collectionName.toUpperCase();
  const getToolName = `${upperName}_GET`;

  const { data } = useSuspenseQuery({
    queryKey: KEYS.collectionItem(
      client,
      scopeKey,
      "",
      upperName,
      itemId ?? "",
    ),
    queryFn: async () => {
      if (!itemId) {
        return { item: null } satisfies CollectionGetOutput<T>;
      }

      const result = await client.callTool({
        name: getToolName,
        arguments: { id: itemId } satisfies CollectionGetInput,
      });

      return extractPayload<CollectionGetOutput<T>>(result);
    },
    staleTime: 60_000,
  });

  return data?.item ?? null;
}

/** Fake MCP result for empty collection list when client is skipped */
export const EMPTY_COLLECTION_LIST_RESULT = {
  structuredContent: {
    items: [],
  } satisfies CollectionListOutput<CollectionEntity>,
  isError: false,
} as const;

/**
 * Get a paginated list of items from a collection
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, virtualMcpId for virtual-mcp-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param client - The MCP client used to call collection tools (null/undefined returns [] without MCP call)
 * @param options - Filter and configuration options
 * @returns Suspense query result with items array
 */
export function useCollectionList<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  client: Client | null | undefined,
  options: UseCollectionListOptions<T> = {},
) {
  const upperName = collectionName.toUpperCase();
  const listToolName = `${upperName}_LIST`;

  const toolArguments = buildToolArguments(options);

  const argsKey = JSON.stringify(toolArguments);
  const queryKey = KEYS.collectionList(
    client,
    scopeKey,
    "",
    upperName,
    argsKey,
  );

  const { data } = useSuspenseQuery({
    queryKey,
    queryFn: async () => {
      if (!client) {
        return EMPTY_COLLECTION_LIST_RESULT;
      }
      const result = await client.callTool({
        name: listToolName,
        arguments: toolArguments,
      });
      return result;
    },
    staleTime: 30_000,
    retry: false,
    select: (result) => {
      const payload = extractPayload<CollectionListOutput<T>>(result ?? {});
      return payload?.items ?? [];
    },
  });

  return data;
}

/**
 * Builds a query key for a collection list query
 * Matches the internal logic of useCollectionList exactly
 *
 * @param client - The MCP client used to call collection tools (null/undefined is valid for skip queries)
 * @param collectionName - The name of the collection (e.g., "THREAD_MESSAGES", "CONNECTIONS")
 * @param scopeKey - The scope key (connectionId for connection-scoped, virtualMcpId for virtual-mcp-scoped, etc.)
 * @param options - Filter and configuration options
 * @returns Query key array
 */
export function buildCollectionQueryKey<T extends CollectionEntity>(
  client: Client | null | undefined,
  collectionName: string,
  scopeKey: string,
  options: UseCollectionListOptions<T> = {},
): CollectionQueryKey {
  const upperName = collectionName.toUpperCase();
  const toolArguments = buildToolArguments(options);
  const argsKey = JSON.stringify(toolArguments);
  return KEYS.collectionList(client, scopeKey, "", upperName, argsKey);
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
  client: Client,
) {
  const queryClient = useQueryClient();
  const upperName = collectionName.toUpperCase();
  const createToolName = `${upperName}_CREATE`;
  const updateToolName = `${upperName}_UPDATE`;
  const deleteToolName = `${upperName}_DELETE`;

  // Invalidate all collection queries for this scope and collection
  const invalidateCollection = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        // Match collectionList/collectionItem keys: [client, scopeKey, "", "collection", collectionName, ...]
        return (
          key[1] === scopeKey && key[3] === "collection" && key[4] === upperName
        );
      },
    });
  };

  const create = useMutation({
    mutationFn: async (data: Partial<T>) => {
      const result = await client.callTool({
        name: createToolName,
        arguments: { data } satisfies CollectionInsertInput<T>,
      });

      if (result.isError) {
        throw new Error(
          Array.isArray(result.content)
            ? result.content[0]?.text
            : String(result.content),
        );
      }

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
      const result = await client.callTool({
        name: updateToolName,
        arguments: { id, data } satisfies CollectionUpdateInput<T>,
      });
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const result = await client.callTool({
        name: deleteToolName,
        arguments: { id } satisfies CollectionDeleteInput,
      });
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
    delete: remove,
  };
}
