import { useVirtualMCP } from "@decocms/mesh-sdk";
import { useMatch } from "@tanstack/react-router";

/**
 * Derives layout panel visibility from the entity's pinned default view and URL params.
 *
 * - `chatHidden`: true when the entity's pinned view is active (hide chat, show main)
 * - `mainHidden`: true when there's no view to show (hide main, show chat)
 */
export function usePinnedViewLayout(
  virtualMcpId: string | undefined,
  isAgentRoute: boolean,
): { chatHidden: boolean; mainHidden: boolean } {
  const entity = useVirtualMCP(virtualMcpId);

  const agentHomeMatch = useMatch({
    from: "/shell/$org/$virtualMcpId/",
    shouldThrow: false,
  });

  const isOnAgentHome = isAgentRoute && !!agentHomeMatch;
  const hasMainParam = !!agentHomeMatch?.search.main;

  const hasDefaultMainView =
    !!(entity?.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.layout &&
    !!(
      (entity?.metadata?.ui as Record<string, unknown>)?.layout as {
        defaultMainView?: unknown;
      }
    )?.defaultMainView;

  return {
    chatHidden: isOnAgentHome && hasDefaultMainView && !hasMainParam,
    mainHidden: isOnAgentHome && !hasDefaultMainView && !hasMainParam,
  };
}
