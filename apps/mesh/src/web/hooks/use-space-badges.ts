import { useProjectContext } from "@decocms/mesh-sdk";
import { useChatStore } from "@/web/components/chat/store/selectors";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import type { Task } from "@/web/components/chat/task/types";

/**
 * Pure function: compute which spaces have unseen task updates.
 * Exported for unit testing.
 */
export function computeSpaceBadges(
  threads: Task[],
  spaceIds: string[],
  lastSeenMap: Record<string, string>,
): Record<string, boolean> {
  const badges: Record<string, boolean> = {};
  for (const spaceId of spaceIds) {
    const lastSeen = lastSeenMap[spaceId];
    if (!lastSeen) {
      badges[spaceId] = false;
      continue;
    }
    badges[spaceId] = threads.some(
      (t) =>
        !t.hidden && t.agent_ids?.includes(spaceId) && t.updated_at > lastSeen,
    );
  }
  return badges;
}

export function useSpaceBadges(spaceIds: string[]): {
  badges: Record<string, boolean>;
  markSeen: (spaceId: string) => void;
} {
  const { org } = useProjectContext();
  const threads = useChatStore((s) => s.threads);
  const [lastSeenMap, setLastSeenMap] = useLocalStorage<Record<string, string>>(
    LOCALSTORAGE_KEYS.spaceLastSeen(org.id),
    {},
  );

  const badges = computeSpaceBadges(threads, spaceIds, lastSeenMap);

  const markSeen = (spaceId: string) => {
    // Find the max updated_at among tasks for this space
    let maxUpdatedAt: string | undefined;
    for (const t of threads) {
      if (!t.hidden && t.agent_ids?.includes(spaceId)) {
        if (!maxUpdatedAt || t.updated_at > maxUpdatedAt) {
          maxUpdatedAt = t.updated_at;
        }
      }
    }
    if (maxUpdatedAt) {
      setLastSeenMap((prev) => ({ ...prev, [spaceId]: maxUpdatedAt }));
    }
  };

  return { badges, markSeen };
}
