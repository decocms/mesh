/**
 * usePendingChanges hook
 *
 * Compares the in-memory blocks array against the committed HEAD version of the
 * page JSON to compute per-section diff statuses (new / edited / deleted).
 * Uses useQuery (not useEffect) and refetches whenever the pendingChanges query
 * key is invalidated (after every save).
 */

import { useQuery } from "@tanstack/react-query";
import { getGitStatus, getCommittedPage } from "./pending-changes-api";
import { queryKeys } from "./query-keys";
import type { BlockInstance } from "./page-api";

export type SectionChangeStatus = "new" | "edited" | "deleted";

export interface SectionStatus {
  sectionId: string;
  status: SectionChangeStatus;
  /** Only set for deleted sections — the full block instance from HEAD */
  committedBlock?: BlockInstance;
}

export interface PendingChangesResult {
  sectionStatuses: SectionStatus[];
  isDirty: boolean;
  /** True while fetching (initial load) */
  isLoading: boolean;
}

/**
 * Compute per-section diff statuses by comparing in-memory blocks to committed.
 * Pure function — no side effects.
 */
function computeSectionStatuses(
  currentBlocks: BlockInstance[],
  committedBlocks: BlockInstance[] | null,
  isDirty: boolean,
): SectionStatus[] {
  // Not dirty — no badges
  if (!isDirty) {
    return [];
  }

  // No committed data (untracked / new file) — all sections are new
  if (!committedBlocks) {
    return currentBlocks.map((b) => ({
      sectionId: b.id,
      status: "new" as const,
    }));
  }

  const statuses: SectionStatus[] = [];
  const committedMap = new Map(committedBlocks.map((b) => [b.id, b]));
  const currentMap = new Map(currentBlocks.map((b) => [b.id, b]));

  // New sections: present in current, absent in committed
  for (const block of currentBlocks) {
    if (!committedMap.has(block.id)) {
      statuses.push({ sectionId: block.id, status: "new" });
    }
  }

  // Edited sections: present in both but props differ
  for (const block of currentBlocks) {
    const committed = committedMap.get(block.id);
    if (!committed) continue;
    if (JSON.stringify(block.props) !== JSON.stringify(committed.props)) {
      statuses.push({ sectionId: block.id, status: "edited" });
    }
  }

  // Deleted sections: present in committed, absent in current
  for (const block of committedBlocks) {
    if (!currentMap.has(block.id)) {
      statuses.push({
        sectionId: block.id,
        status: "deleted",
        committedBlock: block,
      });
    }
  }

  return statuses;
}

/**
 * Hook that tracks pending changes for a page using server-side git routes.
 *
 * @param connectionId - current site connection id (for cache key scoping + server route auth)
 * @param pageId - page identifier (filename without .json extension)
 * @param currentBlocks - in-memory blocks from undo/redo state
 */
export function usePendingChanges(
  connectionId: string,
  pageId: string,
  currentBlocks: BlockInstance[],
): PendingChangesResult {
  const pageFilePath = `.deco/pages/${pageId}.json`;

  // Step 1: Check if the file is dirty via GIT_STATUS
  const { data: fileStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: queryKeys.pendingChanges.page(connectionId, pageId),
    queryFn: () => getGitStatus(connectionId, pageFilePath),
    staleTime: 0, // Always re-fetch when invalidated
  });

  const isDirty =
    fileStatus != null &&
    (fileStatus.unstaged != null || fileStatus.staged != null);

  // Step 2: Fetch committed page blocks only when dirty
  const { data: committedBlocks, isLoading: isLoadingCommitted } = useQuery({
    queryKey: [...queryKeys.pendingChanges.page(connectionId, pageId), "head"],
    queryFn: () => getCommittedPage(connectionId, pageFilePath),
    enabled: isDirty,
    staleTime: 0,
  });

  // Step 3: Compute per-section statuses (pure derivation)
  const sectionStatuses = computeSectionStatuses(
    currentBlocks,
    committedBlocks ?? null,
    isDirty,
  );

  return {
    sectionStatuses,
    isDirty,
    isLoading: isLoadingStatus || (isDirty && isLoadingCommitted),
  };
}
