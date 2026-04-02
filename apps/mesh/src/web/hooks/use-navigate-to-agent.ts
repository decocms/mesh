/**
 * useNavigateToAgent — navigates to an agent and pins it to the sidebar.
 *
 * Shared hook used by sidebar, home page, and /agents route to handle
 * agent navigation with automatic pinning.
 */

import { useProjectContext, useVirtualMCPs } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import { usePinnedAgents } from "@/web/hooks/use-pinned-agents";

export function useNavigateToAgent() {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const allAgents = useVirtualMCPs();
  const serverPinnedIds = allAgents.filter((a) => !!a.pinned).map((a) => a.id);
  const { pin } = usePinnedAgents(org.id, serverPinnedIds);

  return (virtualMcpId: string) => {
    pin(virtualMcpId);
    navigate({
      to: "/$org/$virtualMcpId/",
      params: { org: org.slug, virtualMcpId },
    });
  };
}
