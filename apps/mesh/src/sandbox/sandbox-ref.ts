/**
 * Mint a deterministic `sandbox_ref` for a new thread.
 *
 * When the thread carries a `virtualMcpId`, the ref is `agent:<userId>:<virtualMcpId>`
 * so every thread on the same agent converges on the same Docker container —
 * new threads skip clone + install because the container already exists.
 * Per-thread isolation inside the shared container is handled by git worktrees
 * (see `ensureThreadWorkspace`).
 *
 * Without a `virtualMcpId` (blank decopilot rows, legacy flows) we fall back
 * to a UUID so those threads still get their own container.
 *
 * Deterministic on `(userId, virtualMcpId)` is load-bearing: VM_START and
 * `createMemory` can both race to create the same thread row; if they
 * computed different sandbox_ref values one of them would provision an
 * orphan container before the DB write settled.
 */
export function mintSandboxRef(
  userId: string,
  virtualMcpId: string | null | undefined,
): string {
  if (virtualMcpId && virtualMcpId.length > 0) {
    return `agent:${userId}:${virtualMcpId}`;
  }
  return crypto.randomUUID();
}
