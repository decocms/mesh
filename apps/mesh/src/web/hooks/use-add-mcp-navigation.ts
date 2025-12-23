/**
 * Hook for navigating to add MCP server
 *
 * Navigates to the store if a registry is connected,
 * otherwise opens the create connection dialog.
 */

import { useNavigate } from "@tanstack/react-router";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useProjectContext } from "@/web/providers/project-context-provider";

/**
 * Returns a function that navigates to add a new MCP server.
 * If a store/registry is connected, navigates to the store.
 * Otherwise, navigates to the connections page with the create dialog open.
 */
export function useAddMcpNavigation() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const allConnections = useConnections();
  const registryConnections = useRegistryConnections(allConnections);
  const hasStore = registryConnections.length > 0;

  const handleAddMcp = () => {
    if (hasStore) {
      navigate({
        to: "/$org/store",
        params: { org: org.slug },
      });
      return;
    }
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  return { handleAddMcp };
}

