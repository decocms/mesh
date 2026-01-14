/**
 * Gateway Collection Hooks
 *
 * Provides React hooks for working with gateways using React Query.
 * These hooks offer a reactive interface for accessing and manipulating gateways.
 */

import { createToolCaller } from "../../../tools/client";
import type { GatewayEntity } from "../../../tools/gateway/schema";
import { useProjectContext } from "../../providers/project-context-provider";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

/**
 * Filter definition for gateways (matches @deco/ui Filter shape)
 */
export type GatewayFilter = CollectionFilter;

/**
 * Options for useGateways hook
 */
export type UseGatewaysOptions = UseCollectionListOptions<GatewayEntity>;

/**
 * Hook to get all gateways
 *
 * @param options - Filter and configuration options
 * @returns Suspense query result with gateways as GatewayEntity[]
 */
export function useGateways(options: UseGatewaysOptions = {}) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionList<GatewayEntity>(
    org.slug,
    "GATEWAY",
    toolCaller,
    options,
  );
}

/**
 * Hook to get a single gateway by ID
 *
 * @param gatewayId - The ID of the gateway to fetch (null/undefined for default gateway)
 * @returns GatewayEntity | null - null means use default gateway
 */
export function useGateway(
  gatewayId: string | null | undefined,
): GatewayEntity | null {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();

  // If null/undefined, return null (use default gateway)
  // Use collection item hook for database gateways
  const dbGateway = useCollectionItem<GatewayEntity>(
    org.slug,
    "GATEWAY",
    gatewayId ?? undefined,
    toolCaller,
  );

  return dbGateway;
}

/**
 * Hook to get gateway mutation actions (create, update, delete)
 *
 * @returns Object with create, update, and delete mutation hooks
 */
export function useGatewayActions() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionActions<GatewayEntity>(org.slug, "GATEWAY", toolCaller);
}

/**
 * Re-export GatewayEntity type for convenience
 */
export type { GatewayEntity };
