/**
 * Connection Collection Hooks
 *
 * Provides React hooks for working with connections using React Query.
 * These hooks offer a reactive interface for accessing and manipulating connections.
 */

import type { ConnectionEntity } from "../../../tools/connection/schema";
import { useProjectContext } from "@decocms/mesh-sdk";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

/**
 * Filter definition for connections (matches @deco/ui Filter shape)
 */
export type ConnectionFilter = CollectionFilter;

/**
 * Options for useConnections hook
 */
export type UseConnectionsOptions = UseCollectionListOptions<ConnectionEntity>;

/**
 * Hook to get all connections
 *
 * @param options - Filter and configuration options
 * @returns Suspense query result with connections as ConnectionEntity[]
 */
export function useConnections(options: UseConnectionsOptions = {}) {
  const { org } = useProjectContext();
  return useCollectionList<ConnectionEntity>(
    org.slug,
    "CONNECTIONS",
    null,
    options,
  );
}

/**
 * Hook to get a single connection by ID
 *
 * @param connectionId - The ID of the connection to fetch
 * @returns Suspense query result with the connection as ConnectionEntity | null
 */
export function useConnection(connectionId: string | undefined) {
  const { org } = useProjectContext();
  return useCollectionItem<ConnectionEntity>(
    org.slug,
    "CONNECTIONS",
    connectionId,
    null,
  );
}

/**
 * Hook to get connection mutation actions (create, update, delete)
 *
 * @returns Object with create, update, and delete mutation hooks
 */
export function useConnectionActions() {
  const { org } = useProjectContext();
  return useCollectionActions<ConnectionEntity>(org.slug, "CONNECTIONS", null);
}

/**
 * Re-export ConnectionEntity type for convenience
 */
export type { ConnectionEntity };
