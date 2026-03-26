import { useProjectContext } from "@decocms/mesh-sdk";
import { useChatStore } from "@/web/components/chat/store/selectors";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import type { Task } from "@/web/components/chat/task/types";

/**
 * Pure function: compute which agents have unseen task updates.
 * Exported for unit testing.
 */
export function computeAgentBadges(
  threads: Task[],
  agentIds: string[],
  lastSeenMap: Record<string, string>,
): Record<string, boolean> {
  const badges: Record<string, boolean> = {};
  for (const agentId of agentIds) {
    const lastSeen = lastSeenMap[agentId];
    if (!lastSeen) {
      badges[agentId] = false;
      continue;
    }
    badges[agentId] = threads.some(
      (t) =>
        !t.hidden && t.agent_ids?.includes(agentId) && t.updated_at > lastSeen,
    );
  }
  return badges;
}

export function useAgentBadges(agentIds: string[]): {
  badges: Record<string, boolean>;
  markSeen: (agentId: string) => void;
} {
  const { org } = useProjectContext();
  const threads = useChatStore((s) => s.threads);
  const [lastSeenMap, setLastSeenMap] = useLocalStorage<Record<string, string>>(
    LOCALSTORAGE_KEYS.agentLastSeen(org.id),
    {},
  );

  const badges = computeAgentBadges(threads, agentIds, lastSeenMap);

  const markSeen = (agentId: string) => {
    let maxUpdatedAt: string | undefined;
    for (const t of threads) {
      if (!t.hidden && t.agent_ids?.includes(agentId)) {
        if (!maxUpdatedAt || t.updated_at > maxUpdatedAt) {
          maxUpdatedAt = t.updated_at;
        }
      }
    }
    if (maxUpdatedAt) {
      setLastSeenMap((prev) => ({ ...prev, [agentId]: maxUpdatedAt }));
    }
  };

  return { badges, markSeen };
}
