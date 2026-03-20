import { useQueryClient } from "@tanstack/react-query";
import type { PublicConfig } from "@/api/routes/public-config";
import { KEYS } from "@/web/lib/query-keys";

/**
 * Reads the public config from the query cache.
 * The data is populated by ThemeProvider's useSuspenseQuery on app load.
 */
export function usePublicConfig(): PublicConfig {
  const queryClient = useQueryClient();
  return queryClient.getQueryData<PublicConfig>(KEYS.publicConfig()) ?? {};
}
