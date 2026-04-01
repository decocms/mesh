/**
 * Hook to create a new virtual MCP (agent).
 * Provides inline virtual MCP creation with optional navigation.
 */

import { useNavigate } from "@tanstack/react-router";
import {
  useProjectContext,
  useVirtualMCPActions,
  useVirtualMCPs,
  type VirtualMCPEntity,
} from "@decocms/mesh-sdk";
import { usePinnedAgents } from "@/web/hooks/use-pinned-agents";

interface CreateVirtualMCPResult {
  id: string;
  virtualMcp: VirtualMCPEntity;
}

interface UseCreateVirtualMCPOptions {
  /** If true, automatically navigate to virtual MCP settings after creation */
  navigateOnCreate?: boolean;
}

interface UseCreateVirtualMCPResult {
  /**
   * Create a new virtual MCP with default values.
   * Returns the new virtual MCP data if successful.
   */
  createVirtualMCP: () => Promise<CreateVirtualMCPResult>;
  /**
   * Whether a creation is in progress
   */
  isCreating: boolean;
}

/**
 * Hook that provides inline virtual MCP creation.
 * Use this when you want to create a virtual MCP, optionally navigating to its settings page.
 */
export function useCreateVirtualMCP(
  options: UseCreateVirtualMCPOptions = {},
): UseCreateVirtualMCPResult {
  const { navigateOnCreate = false } = options;
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const actions = useVirtualMCPActions();
  const allAgents = useVirtualMCPs();
  const serverPinnedIds = allAgents.filter((a) => a.pinned).map((a) => a.id);
  const { pin } = usePinnedAgents(org.id, serverPinnedIds);

  const createVirtualMCP = async (): Promise<CreateVirtualMCPResult> => {
    const virtualMcp = await actions.create.mutateAsync({
      title: "New Agent",
      description: "AI-driven assistant designed to handle specific tasks",
      status: "active",
      connections: [],
      pinned: true,
    });

    pin(virtualMcp.id!);

    if (navigateOnCreate) {
      navigate({
        to: "/$org/$virtualMcpId",
        params: {
          org: org.slug,
          virtualMcpId: virtualMcp.id,
        },
        search: { main: "settings" },
      });
    }

    return { id: virtualMcp.id!, virtualMcp }; // ID is guaranteed to be non-null for created virtual MCPs
  };

  return {
    createVirtualMCP,
    isCreating: actions.create.isPending,
  };
}
