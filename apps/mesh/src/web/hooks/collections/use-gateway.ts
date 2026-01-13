/**
 * Gateway Collection Hooks
 *
 * Provides React hooks for working with gateways using React Query.
 * These hooks offer a reactive interface for accessing and manipulating gateways.
 */

import { useMemo } from "react";
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
import {
  getWellKnownDecopilotAgent,
  gatewayWithConnectionsToEntity,
  WellKnownGatewayId,
} from "@/core/well-known-mcp";

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
 * @param gatewayId - The ID of the gateway to fetch
 * @returns Suspense query result with the gateway as GatewayEntity | null
 */
export function useGateway(gatewayId: string | undefined) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();

  // Handle Decopilot (well-known agent)
  const decopilotAgent = useMemo(() => {
    if (gatewayId === WellKnownGatewayId.DECOPILOT) {
      return gatewayWithConnectionsToEntity(getWellKnownDecopilotAgent(org.id));
    }
    return null;
  }, [gatewayId, org.id]);

  // Use collection item hook for database gateways
  const dbGateway = useCollectionItem<GatewayEntity>(
    org.slug,
    "GATEWAY",
    gatewayId === WellKnownGatewayId.DECOPILOT ? undefined : gatewayId,
    toolCaller,
  );

  // Return Decopilot if requested, otherwise return database gateway
  return decopilotAgent ?? dbGateway;
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
