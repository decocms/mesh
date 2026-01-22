/**
 * Virtual MCP Collection Hooks
 *
 * Provides React hooks for working with virtual MCPs using React Query.
 * These hooks offer a reactive interface for accessing and manipulating virtual MCPs.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { VirtualMCPEntity } from "../../../tools/virtual-mcp/schema";
import { KEYS } from "../../lib/query-keys";
import { useMCPClient, useProjectContext } from "@decocms/mesh-sdk";
import {
  type CollectionFilter,
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
  return useCollectionList<VirtualMCPEntity>(
    org.slug,
    "VIRTUAL_MCP",
    null,
    options,
  );
}

/**
 * Hook to get a single virtual MCP by ID
 *
 * @param virtualMcpId - The ID of the virtual MCP to fetch (null/undefined for default virtual MCP)
 * @returns VirtualMCPEntity | null - null means use default virtual MCP
 */
export function useVirtualMCP(
  virtualMcpId: string | null | undefined,
): VirtualMCPEntity | null {
  const { org } = useProjectContext();

  // If null/undefined, return null (use default virtual MCP)
  // Use collection item hook for database virtual MCPs
  const dbVirtualMCP = useCollectionItem<VirtualMCPEntity>(
    org.slug,
    "VIRTUAL_MCP",
    virtualMcpId ?? undefined,
    null,
  );

  return dbVirtualMCP;
}

/**
 * Hook to get virtual MCP mutation actions (create, update, delete)
 *
 * When a Virtual MCP is created, a VIRTUAL connection is auto-created server-side.
 * This hook invalidates both VIRTUAL_MCP and CONNECTIONS caches on create.
 *
 * @returns Object with create, update, and delete mutation hooks
 */
export function useVirtualMCPActions() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
    isVirtualMCP: false,
  });
  const queryClient = useQueryClient();

  // Custom create mutation that also invalidates connections cache
  // because server auto-creates a VIRTUAL connection for each Virtual MCP
  const create = useMutation({
    mutationFn: async (data: Partial<VirtualMCPEntity>) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_CREATE",
        arguments: {
          data,
        },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as { item: VirtualMCPEntity };

      return payload.item;
    },
    onSuccess: () => {
      // Invalidate Virtual MCP queries
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, org.slug, "VIRTUAL_MCP"),
      });
      // Also invalidate Connections queries (VIRTUAL connection is auto-created)
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, org.slug, "CONNECTIONS"),
      });
      toast.success("Agent created successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create agent: ${message}`);
    },
  });

  // Custom update mutation with agent-specific messages
  const update = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<VirtualMCPEntity>;
    }) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_UPDATE",
        arguments: {
          id,
          data,
        },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as { item: VirtualMCPEntity };

      return payload.item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, org.slug, "VIRTUAL_MCP"),
      });
      toast.success("Agent updated successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update agent: ${message}`);
    },
  });

  // Custom delete mutation with agent-specific messages
  const delete_ = useMutation({
    mutationFn: async (id: string) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_DELETE",
        arguments: {
          id,
        },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as { item: { id: string } };

      return payload.item.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, org.slug, "VIRTUAL_MCP"),
      });
      // Also invalidate Connections queries (VIRTUAL connection is auto-deleted)
      queryClient.invalidateQueries({
        queryKey: KEYS.collection(org.slug, org.slug, "CONNECTIONS"),
      });
      toast.success("Agent deleted successfully");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete agent: ${message}`);
    },
  });

  return {
    create,
    update,
    delete: delete_,
  };
}

/**
 * Re-export VirtualMCPEntity type for convenience
 */
export type { VirtualMCPEntity };
