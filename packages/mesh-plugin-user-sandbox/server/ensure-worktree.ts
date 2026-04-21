import type { SandboxRunner } from "./runner/types";

/**
 * Per-thread workspace inside a shared (user, agent) sandbox container.
 *
 * Layout invariant: when the container's `/app` is a git repo (the common
 * case after `bootstrapRepo` clones it), each thread gets its own working
 * tree at `/app/workspaces/thread-<id>` via `git worktree add`. Threads
 * that land before any clone happens (or in repo-less containers) reuse
 * `/app` directly — they lose isolation but stay functional.
 *
 * The worktree shares `.git/objects` with siblings (no extra clone cost)
 * and symlinks `node_modules` from the main worktree on creation, so a
 * "new thread" pays just the `git worktree add` syscall (~50–200ms) rather
 * than re-running `git clone` + `bun install`. Threads that need an
 * isolated dependency set can `rm node_modules && bun install` inside
 * their own worktree — the symlink breaks cleanly and the next install
 * writes a per-worktree `node_modules`.
 *
 * Concurrency: two simultaneous "first exec" calls for the same thread
 * would race on `git worktree add` (git refuses the second with a non-zero
 * exit). The in-process `inflight` map below dedupes within a single mesh
 * process; cross-process races are rare in practice (a thread's first
 * exec hits one mesh replica) and accept-the-retry is fine — the second
 * caller will see the worktree already exists and short-circuit.
 */
export interface ThreadWorkspace {
  /** Absolute path inside the container. Pass as `cwd` to runner.exec or claude spawn. */
  cwd: string;
  /** True when the worktree was created (vs reusing /app for repo-less containers). */
  isolated: boolean;
}

const inflight = new Map<string, Promise<ThreadWorkspace>>();
const resolved = new Map<string, ThreadWorkspace>();

/**
 * Idempotent: ensures `/app/workspaces/thread-<threadId>` exists as a
 * git worktree (when /app is a repo) and returns the path for use as `cwd`.
 *
 * Caches the result per (handle, threadId) for the life of this process so
 * repeated bash/claude calls in the same thread skip the round-trip.
 */
export async function ensureThreadWorkspace(
  runner: SandboxRunner,
  handle: string,
  threadId: string,
): Promise<ThreadWorkspace> {
  const key = `${handle}:${threadId}`;
  const cached = resolved.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const safeId = sanitizeThreadId(threadId);
    const workspace = `/app/workspaces/thread-${safeId}`;
    const branch = `thread/${safeId}`;
    // Single bash invocation so the runner round-trip is one /bash call.
    // Note: `git rev-parse --verify --quiet` returns 0 if the ref exists,
    // 1 otherwise. We use that to decide whether `git worktree add` should
    // create a new branch (-b) or attach to an existing one. The fallback
    // branch handles the case where the worktree was deleted (cleanup) but
    // the branch survived — without it, `-b` would error with "branch
    // already exists".
    const script = [
      "set -e",
      `WT=${shellQuote(workspace)}`,
      `BRANCH=${shellQuote(branch)}`,
      "if [ ! -d /app/.git ]; then",
      "  echo /app",
      "  exit 0",
      "fi",
      "mkdir -p /app/workspaces",
      'if [ ! -d "$WT" ]; then',
      "  cd /app",
      '  if git rev-parse --verify --quiet "$BRANCH" >/dev/null 2>&1; then',
      '    git worktree add "$WT" "$BRANCH" >&2',
      "  else",
      '    git worktree add "$WT" -b "$BRANCH" >&2',
      "  fi",
      // Symlink node_modules from main when present and the worktree
      // doesn't already have its own. A thread that wants isolated deps
      // can `rm node_modules && bun install` inside its worktree — `rm`
      // on a symlink removes only the link, leaving /app/node_modules
      // intact for sibling threads.
      '  if [ -d /app/node_modules ] && [ ! -e "$WT/node_modules" ]; then',
      '    ln -s /app/node_modules "$WT/node_modules"',
      "  fi",
      "fi",
      'echo "$WT"',
    ].join("\n");

    const result = await runner.exec(handle, {
      command: script,
      timeoutMs: 30_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to ensure worktree for thread ${threadId} (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
      );
    }
    // The script prints the chosen cwd as the last non-empty line. stderr
    // carries `git worktree add` chatter; we don't care about it.
    const lines = result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const cwd = lines[lines.length - 1] ?? workspace;
    const ws: ThreadWorkspace = {
      cwd,
      isolated: cwd === workspace,
    };
    resolved.set(key, ws);
    return ws;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Drop a thread's worktree from the shared container. Best-effort —
 * surface errors to the caller but don't throw on the "already gone"
 * case. Removes both the worktree dir and the per-thread branch.
 *
 * If the runner exposes `proxyDaemonRequest`, a `/dev/stop?threadId=…`
 * call is issued first so the dev process tied to this worktree exits
 * before its files disappear — otherwise the runner happily keeps a
 * zombie bun/node listening on a now-orphaned path.
 *
 * Exposed for cleanup paths (thread archive, sweep job). Not yet wired
 * into the lifecycle automatically.
 */
export async function removeThreadWorkspace(
  runner: SandboxRunner,
  handle: string,
  threadId: string,
): Promise<void> {
  const key = `${handle}:${threadId}`;
  resolved.delete(key);

  // Best-effort: tell the daemon to stop this thread's dev process before
  // the worktree dir vanishes. Runners without a daemon (freestyle) skip
  // this path entirely — their dev lifecycle isn't managed here.
  const maybeProxy = (
    runner as SandboxRunner & {
      proxyDaemonRequest?: (
        h: string,
        p: string,
        init: { method: string; headers: Headers; body: BodyInit | null },
      ) => Promise<Response>;
    }
  ).proxyDaemonRequest;
  if (typeof maybeProxy === "function") {
    try {
      await maybeProxy.call(runner, handle, "/dev/stop", {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        body: JSON.stringify({ threadId }),
      });
    } catch {
      // Swallow — we'd rather delete the worktree than fail the cleanup.
    }
  }

  const safeId = sanitizeThreadId(threadId);
  const workspace = `/app/workspaces/thread-${safeId}`;
  const branch = `thread/${safeId}`;
  const script = [
    "set +e",
    `WT=${shellQuote(workspace)}`,
    `BRANCH=${shellQuote(branch)}`,
    "if [ -d /app/.git ]; then",
    "  cd /app",
    '  git worktree remove --force "$WT" >&2 || rm -rf "$WT"',
    '  git branch -D "$BRANCH" >&2 || true',
    "else",
    '  rm -rf "$WT"',
    "fi",
  ].join("\n");
  await runner.exec(handle, { command: script, timeoutMs: 15_000 });
}

/**
 * Strip anything that's not safe inside a path segment or git ref. Thread
 * IDs are mesh-generated (`thrd_<uuid>`) so this is defensive — any oddly
 * named id (legacy import, manual insert) gets normalized rather than
 * blowing up `git worktree add` with a cryptic error.
 */
function sanitizeThreadId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
