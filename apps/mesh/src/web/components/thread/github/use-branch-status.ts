import { useVirtualMCP } from "@decocms/mesh-sdk";
import {
  useVmEvents,
  type BranchStatus,
} from "@/web/components/vm/hooks/use-vm-events";

/**
 * useBranchStatus — returns the VM daemon's latest branch-status snapshot
 * for a given (virtualMcpId, userId, branch), or null if the VM is unknown
 * or not yet connected.
 *
 * Resolves previewUrl from the vMCP's vmMap metadata, then subscribes to
 * the VM daemon SSE. Passes a null chunk handler since this hook doesn't
 * consume PTY logs.
 */
export function useBranchStatus({
  virtualMcpId,
  userId,
  branch,
}: {
  virtualMcpId: string;
  userId: string | null;
  branch: string | null;
}): BranchStatus | null {
  const vm = useVirtualMCP(virtualMcpId);
  const vmMap = vm?.metadata?.vmMap as
    | Record<string, Record<string, { previewUrl?: string | null }>>
    | undefined;
  const previewUrl =
    userId && branch ? (vmMap?.[userId]?.[branch]?.previewUrl ?? null) : null;

  const { branchStatus } = useVmEvents(previewUrl, null);
  return branchStatus;
}
