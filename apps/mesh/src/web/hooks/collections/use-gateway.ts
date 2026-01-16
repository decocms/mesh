/**
 * Gateway Collection Hooks
 *
 * @deprecated Use use-virtual-mcp.ts instead. This file is kept for backward compatibility.
 *
 * Provides React hooks for working with virtual MCPs (formerly gateways) using React Query.
 * These hooks offer a reactive interface for accessing and manipulating virtual MCPs.
 */

import { createToolCaller } from "../../../tools/client";
import type { VirtualMCPEntity } from "../../../tools/virtual-mcp/schema";
import { useProjectContext } from "../../providers/project-context-provider";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

// Type alias for backward compatibility
export type GatewayEntity = VirtualMCPEntity;

/**
 * Filter definition for gateways (matches @deco/ui Filter shape)
 */
export type GatewayFilter = CollectionFilter;

/**
 * Options for useGateways hook
 */
export type UseGatewaysOptions = UseCollectionListOptions<GatewayEntity>;

/**
 * Hook to get all gateways (virtual MCPs)
 *
 * @deprecated Use useVirtualMCPs from use-virtual-mcp.ts instead
 * @param options - Filter and configuration options
 * @returns Suspense query result with gateways as GatewayEntity[]
 */
export function useGateways(options: UseGatewaysOptions = {}) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  // Use VIRTUAL_MCP to match the renamed tools (COLLECTION_VIRTUAL_MCP_LIST, etc.)
  return useCollectionList<GatewayEntity>(
    org.slug,
    "VIRTUAL_MCP",
    toolCaller,
    options,
  );
}

/**
 * Hook to get a single gateway by ID
 *
 * @deprecated Use useVirtualMCP from use-virtual-mcp.ts instead
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
    "VIRTUAL_MCP",
    gatewayId ?? undefined,
    toolCaller,
  );

  return dbGateway;
}

/**
 * Hook to get gateway mutation actions (create, update, delete)
 *
 * @deprecated Use useVirtualMCPActions from use-virtual-mcp.ts instead
 * @returns Object with create, update, and delete mutation hooks
 */
export function useGatewayActions() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionActions<GatewayEntity>(
    org.slug,
    "VIRTUAL_MCP",
    toolCaller,
  );
}
