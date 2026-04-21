/**
 * vmMap helpers — per-user, per-branch vm registry.
 *
 * vmMap[userId][branch] -> vmId
 *
 * Kept in the virtualmcp's metadata JSON column alongside activeVms.
 * Lookup lets threads sharing a (user, branch) pair route to the same vm.
 *
 * NOTE: same read-modify-write caveat as patchActiveVms — not atomic across
 * pods; two concurrent VM_START calls for the same (vm, user, branch) can
 * race. Accepted for v1.
 */

import type { VmMap } from "@decocms/mesh-sdk";

import type { VirtualMCPStoragePort } from "../../storage/ports";
import type { VirtualMCPUpdateData } from "../virtual/schema";
import type { VmMetadata } from "./types";

export function readVmMap(
  metadata: Record<string, unknown> | null | undefined,
): VmMap {
  if (!metadata || typeof metadata !== "object") return {};
  const map = (metadata as { vmMap?: unknown }).vmMap;
  if (!map || typeof map !== "object") return {};
  return map as VmMap;
}

export function resolveVm(
  vmMap: VmMap,
  userId: string,
  branch: string,
): string | null {
  return vmMap[userId]?.[branch] ?? null;
}

/**
 * Read-modify-write: sets `vmMap[userId][branch] = vmId` on the virtualmcp.
 * Creates the user entry if it doesn't exist.
 */
export async function setVmMapEntry(
  storage: VirtualMCPStoragePort,
  virtualMcpId: string,
  actingUserId: string,
  targetUserId: string,
  branch: string,
  vmId: string,
): Promise<void> {
  const virtualMcp = await storage.findById(virtualMcpId);
  if (!virtualMcp) return;

  const meta = virtualMcp.metadata as VmMetadata;
  const current = readVmMap(meta);
  const next: VmMap = {
    ...current,
    [targetUserId]: {
      ...(current[targetUserId] ?? {}),
      [branch]: vmId,
    },
  };

  await storage.update(virtualMcpId, actingUserId, {
    metadata: {
      ...meta,
      vmMap: next,
    } as VirtualMCPUpdateData["metadata"],
  });
}

/**
 * Read-modify-write: removes `vmMap[userId][branch]` from the virtualmcp.
 * Drops the user entry entirely when it becomes empty.
 */
export async function removeVmMapEntry(
  storage: VirtualMCPStoragePort,
  virtualMcpId: string,
  actingUserId: string,
  targetUserId: string,
  branch: string,
): Promise<void> {
  const virtualMcp = await storage.findById(virtualMcpId);
  if (!virtualMcp) return;

  const meta = virtualMcp.metadata as VmMetadata;
  const current = readVmMap(meta);
  if (!current[targetUserId]?.[branch]) return;

  const userMap = { ...current[targetUserId] };
  delete userMap[branch];

  const next: VmMap = { ...current };
  if (Object.keys(userMap).length === 0) {
    delete next[targetUserId];
  } else {
    next[targetUserId] = userMap;
  }

  await storage.update(virtualMcpId, actingUserId, {
    metadata: {
      ...meta,
      vmMap: next,
    } as VirtualMCPUpdateData["metadata"],
  });
}
