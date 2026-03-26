import { useProjectContext } from "@decocms/mesh-sdk";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useDecopilotEvents } from "@/web/hooks/use-decopilot-events";

/**
 * Pure function: compute which agents have unseen updates.
 * Exported for unit testing.
 */
export function computeAgentBadges(
  agentIds: string[],
  agentUpdatedMap: Record<string, string>,
  lastSeenMap: Record<string, string>,
): Record<string, boolean> {
  const badges: Record<string, boolean> = {};
  for (const agentId of agentIds) {
    const lastUpdated = agentUpdatedMap[agentId];
    const lastSeen = lastSeenMap[agentId];
    if (!lastUpdated) {
      badges[agentId] = false;
      continue;
    }
    badges[agentId] = !lastSeen || lastUpdated > lastSeen;
  }
  return badges;
}

/**
 * SSE-driven agent badges.
 *
 * Listens to org-wide `decopilot.thread.status` events and records
 * the latest update timestamp per agent in localStorage. No dependency
 * on the thread list or ChatStore — works across all virtualMcpIds.
 */
export function useAgentBadges(agentIds: string[]): {
  badges: Record<string, boolean>;
  markSeen: (agentId: string) => void;
} {
  const { org } = useProjectContext();

  const [agentUpdatedMap, setAgentUpdatedMap] = useLocalStorage<
    Record<string, string>
  >(LOCALSTORAGE_KEYS.agentLastUpdated(org.id), {});

  const [lastSeenMap, setLastSeenMap] = useLocalStorage<Record<string, string>>(
    LOCALSTORAGE_KEYS.agentLastSeen(org.id),
    {},
  );

  useDecopilotEvents({
    orgId: org.id,
    onTaskStatus: (event) => {
      const virtualMcpId = event.data.virtual_mcp_id;
      if (!virtualMcpId) return;

      setAgentUpdatedMap((prev) => {
        if (prev[virtualMcpId] && event.time <= prev[virtualMcpId]) return prev;
        return { ...prev, [virtualMcpId]: event.time };
      });
    },
  });

  const badges = computeAgentBadges(agentIds, agentUpdatedMap, lastSeenMap);

  const markSeen = (agentId: string) => {
    const now = new Date().toISOString();
    setLastSeenMap((prev) => ({ ...prev, [agentId]: now }));
  };

  return { badges, markSeen };
}
