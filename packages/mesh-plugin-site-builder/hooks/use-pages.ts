/**
 * Pages Hook
 *
 * Fetches pages from a running Deco site via the /.decofile endpoint.
 * Pages are blocks with IDs starting with "pages-".
 */

import { useQuery } from "@tanstack/react-query";
import { useDevServer } from "./use-dev-server";
import { KEYS } from "../lib/query-keys";

export interface PageInfo {
  id: string;
  name: string;
  path: string;
  __resolveType?: string;
}

interface DecofileBlock {
  name?: string;
  path?: string;
  __resolveType?: string;
}

export function usePages() {
  const { isRunning, serverUrl } = useDevServer();

  const {
    data: pages = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: KEYS.sitePages(serverUrl),
    queryFn: async (): Promise<PageInfo[]> => {
      try {
        const response = await fetch(`${serverUrl}/.decofile`, {
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch decofile: ${response.status}`);
        }

        const decofile = (await response.json()) as Record<
          string,
          DecofileBlock
        >;

        // Extract pages (blocks starting with "pages-")
        const pagesList: PageInfo[] = [];

        for (const [blockId, block] of Object.entries(decofile)) {
          if (blockId.startsWith("pages-")) {
            pagesList.push({
              id: blockId,
              name: block.name || blockId.replace("pages-", ""),
              path: block.path || "/",
              __resolveType: block.__resolveType,
            });
          }
        }

        // Sort by path
        pagesList.sort((a, b) => a.path.localeCompare(b.path));

        return pagesList;
      } catch (e) {
        console.error("[usePages] Failed to fetch pages:", e);
        throw e;
      }
    },
    enabled: isRunning,
    staleTime: 10000,
    refetchInterval: isRunning ? 30000 : false, // Refetch every 30s when running
  });

  return {
    pages,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
