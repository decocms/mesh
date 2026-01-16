/**
 * Virtual MCP Collection Hooks
 *
 * Provides React hooks for working with virtual MCPs using React Query.
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

/**
 * Filter definition for virtual MCPs (matches @deco/ui Filter shape)
 */
export type VirtualMCPFilter = CollectionFilter;

/**
 * Options for useVirtualMCPs hook
 */
export type UseVirtualMCPsOptions = UseCollectionListOptions<VirtualMCPEntity>;

/**
 * Hook to get all virtual MCPs
 *
 * @param options - Filter and configuration options
 * @returns Suspense query result with virtual MCPs as VirtualMCPEntity[]
 */
export function useVirtualMCPs(options: UseVirtualMCPsOptions = {}) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  // Note: Collection name maps to tool names like COLLECTION_{NAME}_LIST
  // So "VIRTUAL_MCP" -> COLLECTION_VIRTUAL_MCP_LIST
  return useCollectionList<VirtualMCPEntity>(
    org.slug,
    "VIRTUAL_MCP",
    toolCaller,
    options,
  );
}

/**
 * Hook to get a single virtual MCP by ID
 *
 * @param virtualMcpId - The ID of the virtual MCP to fetch (null/undefined for default)
 * @returns VirtualMCPEntity | null - null means use default
 */
export function useVirtualMCP(
  virtualMcpId: string | null | undefined,
): VirtualMCPEntity | null {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();

  // If null/undefined, return null (use default)
  // Use collection item hook for database virtual MCPs
  const dbVirtualMcp = useCollectionItem<VirtualMCPEntity>(
    org.slug,
    "VIRTUAL_MCP",
    virtualMcpId ?? undefined,
    toolCaller,
  );

  return dbVirtualMcp;
}

/**
 * Hook to get virtual MCP mutation actions (create, update, delete)
 *
 * @returns Object with create, update, and delete mutation hooks
 */
export function useVirtualMCPActions() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionActions<VirtualMCPEntity>(
    org.slug,
    "VIRTUAL_MCP",
    toolCaller,
  );
}

/**
 * Re-export VirtualMCPEntity type for convenience
 */
export type { VirtualMCPEntity };

// Backward compatibility aliases
/** @deprecated Use useVirtualMCPs instead */
export const useGateways = useVirtualMCPs;
/** @deprecated Use useVirtualMCP instead */
export const useGateway = useVirtualMCP;
/** @deprecated Use useVirtualMCPActions instead */
export const useGatewayActions = useVirtualMCPActions;
/** @deprecated Use VirtualMCPEntity instead */
export type GatewayEntity = VirtualMCPEntity;
