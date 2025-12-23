import { isConnectionAuthenticated } from "@/web/lib/mcp-oauth";
import { KEYS } from "@/web/lib/query-keys";
import { useSuspenseQuery } from "@tanstack/react-query";

/**
 * Hook to verify if an OAuth token is valid
 * Uses Suspense for loading states - wrap components in <Suspense> and <ErrorBoundary>.
 * @param connectionId - Connection ID
 * @returns isMCPAuthenticated - true if authenticated, false otherwise
 */
export function useIsMCPAuthenticated({
  connectionId,
}: {
  connectionId: string;
}) {
  const mcpProxyUrl = new URL(`/mcp/${connectionId}`, window.location.origin);
  const { data: isMCPAuthenticated } = useSuspenseQuery({
    queryKey: KEYS.isMCPAuthenticated(mcpProxyUrl.href, null),
    queryFn: () =>
      isConnectionAuthenticated({
        url: mcpProxyUrl.href,
        token: null,
      }),
  });

  return isMCPAuthenticated;
}
