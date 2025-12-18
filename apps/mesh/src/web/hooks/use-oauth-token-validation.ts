import { isConnectionAuthenticated } from "@/web/lib/browser-oauth-provider";
import { KEYS } from "@/web/lib/query-keys";
import { useSuspenseQuery } from "@tanstack/react-query";

/**
 * Hook to verify if an OAuth token is valid
 * Uses Suspense for loading states - wrap components in <Suspense> and <ErrorBoundary>.
 * @param connectionUrl - Connection URL
 * @param connectionToken - Connection token
 * @returns isMCPAuthenticated - true if authenticated, false otherwise
 */
export function useIsMCPAuthenticated({
  url,
  token,
}: {
  url: string;
  token: string | null;
}) {
  const { data: isMCPAuthenticated } = useSuspenseQuery({
    queryKey: KEYS.isMCPAuthenticated(url, token),
    queryFn: () =>
      isConnectionAuthenticated({
        url,
        token,
      }),
  });

  return isMCPAuthenticated;
}
