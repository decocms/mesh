/**
 * Chat Store Hooks using React Query + IndexedDB
 *
 * Provides React hooks for working with threads and messages stored in IndexedDB.
 * Uses TanStack React Query for caching and mutations with idb-keyval for persistence.
 */

import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import {
  useMCPClient,
  useProjectContext,
  WellKnownOrgMCPId,
} from "@decocms/mesh-sdk";
import type { Message, Thread } from "../components/chat/types.ts";
import type {
  CollectionListInput,
  CollectionListOutput,
} from "@decocms/bindings/collections";

const THREADS_PAGE_SIZE = 50;

/**
 * Hook to get all threads with infinite scroll pagination
 *
 * @returns Object with threads array, pagination helpers, and refetch function
 */
export function useThreads() {
  const { locator, org } = useProjectContext();
  const client = useMCPClient({
    connectionId: WellKnownOrgMCPId.SELF(org.id),
    orgId: org.id,
  });
  const listToolName = "COLLECTION_THREADS_LIST";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useSuspenseInfiniteQuery({
      queryKey: KEYS.threads(locator),
      queryFn: async ({ pageParam = 0 }) => {
        if (!client) {
          throw new Error("MCP client is not available");
        }
        const input: CollectionListInput = {
          limit: THREADS_PAGE_SIZE,
          offset: pageParam,
        };

        const result = await client.callTool({
          name: listToolName,
          arguments: input,
        });

        // Extract payload - MCP CallToolResult has structuredContent or content
        // structuredContent is the parsed JSON, content is the raw text
        let payload: CollectionListOutput<Thread>;

        if (result.isError) {
          const errorText = Array.isArray(result.content)
            ? result.content
                .map((c) => (c.type === "text" ? c.text : ""))
                .join("\n")
            : "Unknown error";

          // Debug: log error details
          if (process.env.NODE_ENV === "development") {
            // eslint-disable-next-line no-console
            console.error("[useThreads] Tool call error:", {
              errorText,
              isError: result.isError,
              content: result.content,
              contentString: Array.isArray(result.content)
                ? result.content
                    .map((c) => {
                      if (c.type === "text") return c.text;
                      return JSON.stringify(c);
                    })
                    .join("\n")
                : String(result.content),
            });
          }

          // Don't throw - return empty result instead to prevent UI crash
          // The ErrorBoundary will handle it gracefully
          return {
            items: [],
            hasMore: false,
            totalCount: 0,
          };
        }

        if ("structuredContent" in result && result.structuredContent) {
          payload = result.structuredContent as CollectionListOutput<Thread>;
        } else if (Array.isArray(result.content) && result.content.length > 0) {
          // Fallback: try to parse from content text
          const textContent = result.content
            .map((c) => (c.type === "text" ? c.text : null))
            .filter(Boolean)
            .join("");
          if (textContent) {
            try {
              payload = JSON.parse(textContent) as CollectionListOutput<Thread>;
            } catch {
              throw new Error("Failed to parse tool result");
            }
          } else {
            throw new Error("Tool result has no content");
          }
        } else {
          // Direct result (shouldn't happen but handle it)
          payload = result as unknown as CollectionListOutput<Thread>;
        }

        // Debug: log query results
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.log("[useThreads] Query result:", {
            hasStructuredContent: "structuredContent" in result,
            hasContent:
              Array.isArray(result.content) && result.content.length > 0,
            payload,
            items: payload.items?.length ?? 0,
            totalCount: payload.totalCount,
            hasMore: payload.hasMore,
            offset: pageParam,
          });
        }

        return {
          items: payload.items ?? [],
          hasMore: payload.hasMore ?? false,
          totalCount: payload.totalCount ?? 0,
        };
      },
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage.hasMore) {
          return undefined;
        }
        return allPages.length * THREADS_PAGE_SIZE;
      },
      initialPageParam: 0,
      staleTime: 30_000,
    });

  // Flatten all pages into a single threads array
  const threads = data?.pages.flatMap((page) => page.items) ?? [];

  return {
    threads,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}

/**
 * Hook to get messages for a specific thread
 *
 * @param threadId - The ID of the thread
 * @returns Suspense query result with messages array
 */
export function useThreadMessages(threadId: string | null) {
  const { locator, org } = useProjectContext();
  const client = useMCPClient({
    connectionId: WellKnownOrgMCPId.SELF(org.id),
    orgId: org.id,
  });
  const listToolName = "COLLECTION_THREAD_MESSAGES_LIST";

  const { data } = useSuspenseQuery({
    queryKey: KEYS.threadMessages(locator, threadId ?? ""),
    queryFn: async () => {
      try {
        if (!threadId || !client) {
          return [];
        }
        const input: CollectionListInput & { threadId: string | null } = {
          threadId,
          limit: 100,
          offset: 0,
        };
        const result = (await client.callTool({
          name: listToolName,
          arguments: input,
        })) as { structuredContent?: unknown };
        const payload = (result.structuredContent ??
          result) as CollectionListOutput<Message>;
        return payload.items ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 0,
  });
  return data ?? [];
}
