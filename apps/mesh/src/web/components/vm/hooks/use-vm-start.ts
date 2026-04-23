/**
 * Single VM_START mutation shared by preview + env surfaces. Mutation, not
 * effects: three useEffects (auto-start, self-heal, manual retry) previously
 * each had their own dedup+error path, coupling SSE state to mutation state.
 * Routing through callVmTool surfaces MCP-protocol errors uniformly.
 * Does NOT dedup — callers gate mutate() themselves (per-taskId vs per-deadVmId).
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
    // Per-call onSuccess (via `mutate(args, { onSuccess })`) runs AFTER this.
    onSuccess: () => {
      invalidateVirtualMcpQueries(queryClient);
    },
  });
}
