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
  type OrderByExpression,
  type WhereExpression,
} from "@decocms/bindings/collections";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ToolCaller } from "../lib/tool-caller";
import { KEYS } from "../lib/query-keys";
import { useProjectContext } from "../context/project-context";

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
 * Get a single item by ID from a collection
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, gatewayId for gateway-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param itemId - The ID of the item to fetch
 * @param toolCaller - The tool caller function for making API calls
 * @returns Suspense query result with the item
 */
export function useCollectionItem<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  itemId: string | undefined,
  toolCaller: ToolCaller,
) {
  const { org } = useProjectContext();
  const upperName = collectionName.toUpperCase();
  const getToolName = `COLLECTION_${upperName}_GET`;

  const { data } = useSuspenseQuery({
    queryKey: KEYS.collectionItem(
      org.slug,
      scopeKey,
      collectionName,
      itemId ?? "",
    ),
    queryFn: async () => {
      if (!itemId) {
        return { item: null } as CollectionGetOutput<T>;
      }

      const result = (await toolCaller(getToolName, {
        id: itemId,
      } as CollectionGetInput)) as CollectionGetOutput<T>;

      return result;
    },
    staleTime: 60_000,
  });

  return data.item;
}

/**
 * Get a paginated list of items from a collection
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, gatewayId for gateway-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param toolCaller - The tool caller function for making API calls
 * @param options - Filter and configuration options
 * @returns Suspense query result with items array
 */
export function useCollectionList<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  toolCaller: ToolCaller,
  options: UseCollectionListOptions<T> = {},
) {
  const { org } = useProjectContext();
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

  // Create a stable params key for the query key
  const paramsKey = JSON.stringify({ where, orderBy, limit: pageSize });

  const { data } = useSuspenseQuery({
    queryKey: KEYS.collectionList(
      org.slug,
      scopeKey,
      collectionName,
      paramsKey,
    ),
    queryFn: async () => {
      const input: CollectionListInput = {
        ...(where && { where }),
        ...(orderBy && { orderBy }),
        limit: pageSize,
        offset: 0,
      };
      const result = (await toolCaller(
        listToolName,
        input,
      )) as CollectionListOutput<T>;

      return result?.items ?? [];
    },
  });

  return data;
}

/**
 * Get mutation actions for create, update, and delete operations
 *
 * @param scopeKey - The scope key (connectionId for connection-scoped, gatewayId for gateway-scoped, etc.)
 * @param collectionName - The name of the collection (e.g., "CONNECTIONS", "AGENT")
 * @param toolCaller - The tool caller function for making API calls
 * @returns Object with create, update, and delete mutation hooks
 */
export function useCollectionActions<T extends CollectionEntity>(
  scopeKey: string,
  collectionName: string,
  toolCaller: ToolCaller,
) {
  const { org } = useProjectContext();
  const queryClient = useQueryClient();
  const upperName = collectionName.toUpperCase();
  const createToolName = `COLLECTION_${upperName}_CREATE`;
  const updateToolName = `COLLECTION_${upperName}_UPDATE`;
  const deleteToolName = `COLLECTION_${upperName}_DELETE`;

  const create = useMutation({
    mutationFn: async (data: Partial<T>) => {
      const result = (await toolCaller(createToolName, {
        data,
      } as CollectionInsertInput<T>)) as CollectionInsertOutput<T>;

      return result.item;
    },
    onSuccess: () => {
      // Invalidate all queries for this collection using the base prefix
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, scopeKey, collectionName),
      });
      toast.success("Item created successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create item: ${message}`);
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<T> }) => {
      const result = (await toolCaller(updateToolName, {
        id,
        data,
      } as CollectionUpdateInput<T>)) as CollectionUpdateOutput<T>;

      return result.item;
    },
    onSuccess: () => {
      // Invalidate all queries for this collection using the base prefix
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, scopeKey, collectionName),
      });
      toast.success("Item updated successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update item: ${message}`);
    },
  });

  const delete_ = useMutation({
    mutationFn: async (id: string) => {
      const result = (await toolCaller(deleteToolName, {
        id,
      } as CollectionDeleteInput)) as CollectionDeleteOutput<T>;

      return result.item.id;
    },
    onSuccess: () => {
      // Invalidate all queries for this collection using the base prefix
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, scopeKey, collectionName),
      });
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
