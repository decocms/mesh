/**
 * Last-activity tracker for the daemon. Bumped on every inbound request the
 * daemon serves (preview-proxy passthrough, /_decopilot_vm/* admin, exec, SSE
 * connect, websocket upgrade) — *except* the readiness probe (/health) and
 * the idle endpoint itself, which would otherwise mask real idleness.
 *
 * Mesh's idle-sweep polls `/idle` to decide whether to push the SandboxClaim's
 * `spec.lifecycle.shutdownTime` forward. The daemon owns the activity signal
 * because it sees 100% of traffic to the pod; mesh only sees code-paths it
 * explicitly instruments, which is exactly the bug we hit (iframe traffic
 * never reached an `ensure()` call so the operator reaped a "live" pod).
 */

let lastActivityAt = Date.now();

export function bumpActivity(now: number = Date.now()): void {
  lastActivityAt = now;
}

export function getIdleStatus(now: number = Date.now()): {
  lastActivityAt: string;
  idleMs: number;
} {
  return {
    lastActivityAt: new Date(lastActivityAt).toISOString(),
    idleMs: Math.max(0, now - lastActivityAt),
  };
}

/** Test-only: reset the singleton between tests. */
export function __resetActivityForTests(now: number = Date.now()): void {
  lastActivityAt = now;
}
