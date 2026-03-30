import { useVirtualMCP } from "@decocms/mesh-sdk";
import { useMatch } from "@tanstack/react-router";

/**
 * Determines which panel to show on the agent home route.
 *
 * Main and chat are mutually exclusive on this route:
 * - Show main when `?main` param is set OR a non-chat default view is pinned
 * - Show chat otherwise (no default view, or default view is "chat")
 *
 * Returns `{ showMain }` — when true, main is initially expanded and chat collapsed,
 * and vice versa. Outside the agent home route, both panels show normally.
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
  if (!isOnAgentHome) {
    return { chatHidden: false, mainHidden: false };
  }

  const hasMainParam = !!agentHomeMatch?.search.main;
  if (hasMainParam) {
    return { chatHidden: false, mainHidden: false };
  }

  const layoutConfig = (
    entity?.metadata?.ui as Record<string, unknown> | null | undefined
  )?.layout as {
    defaultMainView?: { type: string };
  } | null;

  const defaultViewType = layoutConfig?.defaultMainView?.type ?? null;
  const showMain = defaultViewType !== null && defaultViewType !== "chat";

  return {
    chatHidden: showMain,
    mainHidden: !showMain,
  };
}
