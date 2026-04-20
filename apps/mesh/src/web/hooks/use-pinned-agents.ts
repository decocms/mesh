import { authClient } from "@/web/lib/auth-client";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { useRef } from "react";

export function usePinnedAgents(orgId: string, serverPinnedIds: string[]) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? "anon";
  const storageKey = `mesh:pinned-agents:${orgId}:${userId}`;

  const [pinnedIds, setPinnedIds] = useLocalStorage<string[]>(
    storageKey,
    (existing) => existing ?? serverPinnedIds,
  );

  // Track which server IDs we've already synced to avoid re-running
  const syncedRef = useRef<Set<string>>(new Set(pinnedIds));

  // Sync new server-pinned IDs into the local list.
  // This handles agents created after the initial localStorage was set
  // (e.g. project agents created at startup while the user already had a session).
  const newIds = serverPinnedIds.filter(
    (id) => !pinnedIds.includes(id) && !syncedRef.current.has(id),
  );
  if (newIds.length > 0) {
    for (const id of newIds) syncedRef.current.add(id);
    // Schedule the state update after render to avoid updating during render
    queueMicrotask(() => {
      setPinnedIds((prev) => {
        const toAdd = newIds.filter((id) => !prev.includes(id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    });
  }

  const pin = (id: string) => {
    setPinnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const unpin = (id: string) => {
    setPinnedIds((prev) => prev.filter((x) => x !== id));
  };

  const reorder = (newOrder: string[]) => {
    setPinnedIds(newOrder);
  };

  const isPinned = (id: string) => pinnedIds.includes(id);

  return { pinnedIds, pin, unpin, reorder, isPinned };
}
