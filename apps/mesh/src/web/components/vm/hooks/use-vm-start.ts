/**
 * Single VM_START mutation shared by preview + env + layout surfaces.
 * Routing through callVmTool surfaces MCP-protocol errors uniformly.
 * Cross-component dedup via module-level in-flight map: concurrent callers
 * for the same (virtualMcpId, branch) attach to one upstream request, so
 * rapid mounts on navigation can't stack 10–30s container-create calls.
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

const inflightStarts = new Map<string, Promise<VmStartResult>>();
const startKey = (args: VmStartArgs) =>
  `${args.virtualMcpId}::${args.branch ?? ""}`;

export function useVmStart(client: MinimalMcpClient) {
  const queryClient = useQueryClient();
  return useMutation<VmStartResult, Error, VmStartArgs>({
    mutationFn: async (args) => {
      const key = startKey(args);
      const existing = inflightStarts.get(key);
      if (existing) return existing;
      const promise = (async () => {
        const result = await callVmTool(
          client,
          "VM_START",
          args as unknown as Record<string, unknown>,
        );
        return result.structuredContent as VmStartResult;
      })();
      inflightStarts.set(key, promise);
      try {
        return await promise;
      } finally {
        if (inflightStarts.get(key) === promise) inflightStarts.delete(key);
      }
    },
    // Per-call onSuccess (via `mutate(args, { onSuccess })`) runs AFTER this.
    onSuccess: () => {
      invalidateVirtualMcpQueries(queryClient);
    },
  });
}
