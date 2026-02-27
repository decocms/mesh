import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { listSessions, readFile } from "../lib/storage";
import type { SessionMeta } from "../lib/types";

export interface SessionListItem {
  sessionId: string;
  meta: SessionMeta;
}

/**
 * List all research sessions from object storage.
 * Reads meta.json for each discovered session.
 */
export function useResearchSessions() {
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: KEYS.sessions(connectionId),
    queryFn: async (): Promise<SessionListItem[]> => {
      const sessionIds = await listSessions(toolCaller);
      const items: SessionListItem[] = [];

      for (const sessionId of sessionIds) {
        try {
          const meta = await readFile<SessionMeta>(
            toolCaller,
            sessionId,
            "meta.json",
          );
          items.push({ sessionId, meta });
        } catch {
          // Skip sessions without valid meta.json
        }
      }

      // Sort by startedAt descending (most recent first)
      items.sort(
        (a, b) =>
          new Date(b.meta.startedAt).getTime() -
          new Date(a.meta.startedAt).getTime(),
      );

      return items;
    },
    staleTime: 30 * 1000,
  });
}
