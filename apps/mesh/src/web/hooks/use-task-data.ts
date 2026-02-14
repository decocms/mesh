/**
 * Shared hook for fetching task (thread) data.
 *
 * Used by both the /tasks/ page and the TaskListContent panel.
 */

import { KEYS } from "@/web/lib/query-keys";
import type { ThreadEntity } from "@/tools/thread/schema";
import type { CollectionListOutput } from "@decocms/bindings/collections";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";

export function useTaskData() {
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useSuspenseQuery({
    queryKey: KEYS.taskThreads(locator),
    queryFn: async () => {
      if (!client) throw new Error("MCP client is not available");
      const result = (await client.callTool({
        name: "COLLECTION_THREADS_LIST",
        arguments: { limit: 100, offset: 0 },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as CollectionListOutput<ThreadEntity>;
      return payload.items ?? [];
    },
    staleTime: 30_000,
  });
}
