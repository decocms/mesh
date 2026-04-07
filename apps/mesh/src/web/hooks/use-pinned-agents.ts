import { authClient } from "@/web/lib/auth-client";
import { useLocalStorage } from "@/web/hooks/use-local-storage";

export function usePinnedAgents(orgId: string, initialPinnedIds: string[]) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? "anon";
  const storageKey = `mesh:pinned-agents:${orgId}:${userId}`;

  const [pinnedIds, setPinnedIds] = useLocalStorage<string[]>(
    storageKey,
    (existing) => existing ?? initialPinnedIds,
  );

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
