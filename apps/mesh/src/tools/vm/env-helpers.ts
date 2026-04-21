/**
 * Shared helpers for sandbox env var tools.
 */

import {
  requireAuth,
  getUserId,
  type MeshContext,
} from "../../core/mesh-context";

/**
 * Env keys the user must not override — they either configure the daemon
 * itself or would break process PATH/HOME inside the container.
 */
const RESERVED_KEYS = new Set([
  "DAEMON_TOKEN",
  "DAEMON_PORT",
  "WORKDIR",
  "PATH",
  "HOME",
]);

/**
 * Resolve a thread's sandbox_ref after verifying the current user owns the
 * thread. Env tools are always user-scoped — env vars persist across
 * container recreations but never leak across users.
 */
export async function resolveSandboxRef(
  threadId: string,
  ctx: MeshContext,
): Promise<{ sandboxRef: string; userId: string }> {
  requireAuth(ctx);
  await ctx.access.check();
  const userId = getUserId(ctx);
  if (!userId) throw new Error("User ID required");
  const thread = await ctx.storage.threads.get(threadId);
  if (!thread) throw new Error("Thread not found");
  if (thread.created_by !== userId) {
    throw new Error("Thread not owned by current user");
  }
  if (!thread.sandbox_ref) {
    throw new Error(
      "Thread has no sandbox_ref yet — call VM_START first to provision one",
    );
  }
  return { sandboxRef: thread.sandbox_ref, userId };
}

/**
 * Reject keys that would collide with runner-owned container vars.
 */
export function assertWritableKey(key: string): void {
  if (!key) throw new Error("Env key must be non-empty");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(
      `Env key "${key}" must match /^[A-Za-z_][A-Za-z0-9_]*$/ (POSIX identifier)`,
    );
  }
  if (RESERVED_KEYS.has(key)) {
    throw new Error(`Env key "${key}" is reserved by the sandbox runner`);
  }
}
