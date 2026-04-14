/**
 * Shared VM types and metadata helpers.
 *
 * VmEntry / VmMetadata are the runtime view of the `activeVms` sub-key
 * stored inside the Virtual MCP's metadata JSON column.
 *
 * NOTE: The read-modify-write in patchActiveVms is NOT atomic across pods.
 * Two concurrent VM_START calls for the same (virtualMcpId, userId) pair
 * can both read an empty entry, both create Freestyle VMs, and the second
 * write will overwrite the first, leaving an orphaned Freestyle VM. This is
 * an accepted trade-off for the current usage pattern (one user per VM per
 * agent). A proper fix requires either a Postgres advisory lock or a dedicated
 * vm_sessions table with UNIQUE(virtual_mcp_id, user_id).
 */

import type { VirtualMCPStoragePort } from "../../storage/ports";
import type { VirtualMCPUpdateData } from "../virtual/schema";

export interface VmEntry {
  vmId: string;
  previewUrl: string;
  terminalUrl: string | null;
}

export type VmMetadata = {
  githubRepo?: {
    owner: string;
    name: string;
    connectionId: string; // mcp-github connection ID → fetch token from downstream_tokens
  } | null;
  runtime?: {
    detected: string | null;
    selected: string | null;
    installScript?: string | null;
    devScript?: string | null;
    port?: string | null;
  } | null;
  activeVms?: Record<string, VmEntry>;
  [key: string]: unknown;
};

/**
 * Read-modify-write helper: applies `patch` to `metadata.activeVms` and
 * persists the result. Returns the new activeVms map.
 */
export async function patchActiveVms(
  storage: VirtualMCPStoragePort,
  virtualMcpId: string,
  userId: string,
  patch: (current: Record<string, VmEntry>) => Record<string, VmEntry>,
): Promise<void> {
  const virtualMcp = await storage.findById(virtualMcpId);
  if (!virtualMcp) return;

  const meta = virtualMcp.metadata as VmMetadata;
  const updated = patch({ ...(meta.activeVms ?? {}) });

  await storage.update(virtualMcpId, userId, {
    metadata: {
      ...meta,
      activeVms: updated,
    } as VirtualMCPUpdateData["metadata"],
  });
}
