import { isConnectionAuthenticated } from "@/web/lib/browser-oauth-provider";
import { KEYS } from "@/web/lib/query-keys";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to verify if an OAuth token is valid
 * @param connectionUrl - Connection URL
 * @param connectionToken - Connection token
 * @returns isOauthNecessary - true if OAuth is necessary (invalid or missing token)
 */
export function useIsMCPAuthenticated({
  url,
  token,
}: {
  url: string;
  token: string | null;
}) {
  const { data: isMCPAuthenticated } = useQuery({
    queryKey: KEYS.isMCPAuthenticated(url, token),
    queryFn: () =>
      isConnectionAuthenticated({
        url,
        token,
      }),
  });

  return isMCPAuthenticated;
}
