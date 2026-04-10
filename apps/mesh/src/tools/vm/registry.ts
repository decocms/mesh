/**
 * VM Registry
 *
 * In-memory map tracking active VMs by (virtualMcpId, userId).
 * Ensures one VM per virtual MCP per user.
 */

interface VmEntry {
  vmId: string;
  previewUrl: string;
  terminalUrl: string | null;
}

const activeVms = new Map<string, VmEntry>();

function key(virtualMcpId: string, userId: string): string {
  return `${virtualMcpId}:${userId}`;
}

export function getActiveVm(
  virtualMcpId: string,
  userId: string,
): VmEntry | undefined {
  return activeVms.get(key(virtualMcpId, userId));
}

export function setActiveVm(
  virtualMcpId: string,
  userId: string,
  entry: VmEntry,
): void {
  activeVms.set(key(virtualMcpId, userId), entry);
}

export function removeActiveVm(vmId: string): void {
  for (const [k, entry] of activeVms) {
    if (entry.vmId === vmId) {
      activeVms.delete(k);
      return;
    }
  }
}
