/**
 * useVmStart — single VM_START mutation primitive shared by the preview and
 * env surfaces.
 *
 * Why a mutation, not effects: the previous design layered three useEffects
 * that all called VM_START under different conditions (auto-start on first
 * sight of a task, self-heal on SSE 404, manual user click), each with its
 * own dedup ref and its own swallowed-error path. Two consequences:
 *
 *   1. The "shared error" had to live in VmEventsProvider so both the
 *      preview overlay and the env panel could surface failures from any
 *      trigger. That coupled stream-state to mutation-state in the wrong
 *      place — the SSE provider got a foot in mutation lifecycle.
 *
 *   2. MCP-protocol failures (which arrive as `{ isError: true }` rather
 *      than thrown exceptions) were intermittently lost depending on which
 *      call-site the user hit, leaving the UI hung on "Booting…".
 *
 * Routing every start through `callVmTool` (which throws on `isError`) and
 * exposing the result as a TanStack mutation gives every caller the same
 * `isPending` / `error` / `reset` contract for free, and lets the SSE
 * provider go back to being purely about events.
 *
 * The hook intentionally does NOT debounce, dedup by taskId, or cache the
 * last-attempted branch — those concerns are caller-specific (auto-start
 * wants "once per task", self-heal wants "once per dead vmId"). Callers
 * gate the `mutate()` call themselves.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateVirtualMcpQueries } from "@/web/lib/query-keys";
import { callVmTool } from "./call-vm-tool";

interface MinimalMcpClient {
  callTool: (params: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<unknown>;
}

export interface VmStartArgs {
  virtualMcpId: string;
  /** Optional — VM_START generates one when omitted. */
  branch?: string;
}

export interface VmStartResult {
  previewUrl: string | null;
  vmId: string;
  branch: string;
  isNewVm: boolean;
  runnerKind?: "docker" | "freestyle";
}

export function useVmStart(client: MinimalMcpClient) {
  const queryClient = useQueryClient();
  return useMutation<VmStartResult, Error, VmStartArgs>({
    mutationFn: async (args) => {
      const result = await callVmTool(
        client,
        "VM_START",
        args as unknown as Record<string, unknown>,
      );
      return result.structuredContent as VmStartResult;
    },
    // Always invalidate the vmMap-bearing queries on success — every caller
    // needs the fresh entry to render. Per-call onSuccess (passed via the
    // second arg of `mutate`) runs *after* this and can layer on extra
    // bookkeeping (e.g. persisting a server-generated branch to the URL).
    onSuccess: () => {
      invalidateVirtualMcpQueries(queryClient);
    },
  });
}
