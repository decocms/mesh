/**
 * Connection Collection Hooks
 *
 * Provides React hooks for working with connections using React Query.
 * These hooks offer a reactive interface for accessing and manipulating connections.
 */

import type { ConnectionEntity } from "../types/connection";
import { useProjectContext } from "../context/project-context";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "./use-collections";
import { useMCPClient } from "./use-mcp-client";

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
  const client = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
  });
  return useCollectionList<ConnectionEntity>(
    org.slug,
    "CONNECTIONS",
    client,
    options,
  );
}

/**
 * Hook to get a single connection by ID
 *
 * @param connectionId - The ID of the connection to fetch (undefined returns null without making an API call)
 * @returns Suspense query result with the connection as ConnectionEntity | null
 */
export function useConnection(connectionId: string | undefined) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
  });
  return useCollectionItem<ConnectionEntity>(
    org.slug,
    "CONNECTIONS",
    connectionId,
    client,
  );
}

/**
 * Hook to get connection mutation actions (create, update, delete)
 *
 * @returns Object with create, update, and delete mutation hooks
 */
export function useConnectionActions() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
  });
  return useCollectionActions<ConnectionEntity>(
    org.slug,
    "CONNECTIONS",
    client,
  );
}
