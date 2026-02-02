/**
 * Hook that provides utilities to prefill collection query cache
 * Prevents suspension when switching to new/empty collections
 */

import type { CollectionListOutput } from "@decocms/bindings/collections";
import type {
  CollectionEntity,
  UseCollectionListOptions,
} from "@decocms/mesh-sdk";
import { buildCollectionQueryKey } from "@decocms/mesh-sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook that provides utilities to prefill collection query cache
 * Prevents suspension when switching to new/empty collections
 *
 * @returns Object with prefillCollectionCache function
 */
export function useCollectionCachePrefill() {
  const queryClient = useQueryClient();

  /**
   * Prefills the query cache for a collection query to prevent suspension
   *
   * @param client - The MCP client used to call collection tools (null/undefined skips prefilling)
   * @param collectionName - The name of the collection (e.g., "THREAD_MESSAGES", "CONNECTIONS")
   * @param scopeKey - The scope key (orgId, connectionId, etc.)
   * @param options - Filter and configuration options matching useCollectionList
   */
  const prefillCollectionCache = <T extends CollectionEntity>(
    client: Client | null | undefined,
    collectionName: string,
    scopeKey: string,
    options?: UseCollectionListOptions<T>,
  ): void => {
    if (!client) {
      return;
    }

    const queryKey = buildCollectionQueryKey(
      client,
      collectionName,
      scopeKey,
      options,
    );

    if (!queryKey) {
      return;
    }

    // Check if data already exists in cache
    const existingData = queryClient.getQueryData(queryKey);
    if (existingData) {
      return;
    }

    // Prefill cache with empty result structure that matches what useCollectionList's queryFn returns
    // This matches EMPTY_COLLECTION_LIST_RESULT structure (before select transformation)
    const emptyResult = {
      structuredContent: {
        items: [],
      } satisfies CollectionListOutput<T>,
      isError: false,
    };

    // Set the data in cache to prevent suspension
    queryClient.setQueryData(queryKey, emptyResult);
  };

  return {
    prefillCollectionCache,
  };
}
