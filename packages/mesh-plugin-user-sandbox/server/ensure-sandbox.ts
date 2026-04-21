import type {
  EnsureOptions,
  Mount,
  Sandbox,
  SandboxRunner,
} from "./runner/types";

/**
 * Minimal structural shape we need from the tool context to claim a sandbox.
 * Matches a subset of MeshContext (host app) — plugins and built-in tools both
 * satisfy this by exposing `auth.user.id` and `metadata.threadId`.
 */
export interface SandboxToolContext {
  auth: { user?: { id: string } | null };
  metadata?: { threadId?: string };
}

export interface EnsureSandboxOptions {
  /**
   * Optional repo to clone on first provisioning. Runners that don't support
   * cloning MUST ignore this rather than erroring.
   */
  repo?: EnsureOptions["repo"];
  /**
   * Caller-provided identifier for the sandbox (its projectRef in the runner).
   * When omitted, we fall back to `blank:<threadId>` for legacy callers. New
   * callers should always pass this — it's what lets bash and the preview
   * iframe share one container keyed off the thread's stored `sandbox_ref`.
   */
  sandboxRef?: string;
  /**
   * User-defined env vars to inject into the container at provision time.
   * The runner passes these to `docker run -e KEY=VALUE`, so they're frozen
   * for the container's lifetime — changing values requires a recreate.
   */
  env?: Record<string, string>;
  /**
   * Override base image. Callers pass this when a pre-baked `mesh-sandbox-prep`
   * image is ready, letting the new container skip clone + install. Only used
   * on fresh provision; existing containers are unaffected.
   */
  image?: string;
  /**
   * Extra bind mounts + named volumes to attach at provision time. Only
   * applied on fresh provision — existing containers keep their original
   * mount set.
   */
  mounts?: Mount[];
  /**
   * Add `--add-host=host.docker.internal:host-gateway`. Set when code inside
   * the container must reach services bound on the host loopback.
   */
  addHostGateway?: boolean;
}

/**
 * Return the sandbox for the current caller, provisioning lazily.
 *
 * Prefers `opts.sandboxRef` as the runner projectRef. When missing, legacy
 * callers (pre-shared-container) keep the old `blank:<threadId>` key so
 * their existing sandboxes remain reachable.
 */
export async function ensureSandbox(
  ctx: SandboxToolContext,
  runner: SandboxRunner,
  opts: EnsureSandboxOptions = {},
): Promise<Sandbox> {
  const userId = ctx.auth.user?.id;
  if (!userId) {
    throw new Error("Authenticated user required for sandbox access");
  }
  let projectRef: string;
  if (opts.sandboxRef) {
    projectRef = opts.sandboxRef;
  } else {
    const threadId = ctx.metadata?.threadId;
    if (!threadId) {
      throw new Error(
        "sandboxRef and threadId are both missing — sandbox tools must be invoked with an explicit sandboxRef or inside a Decopilot thread",
      );
    }
    projectRef = `blank:${threadId}`;
  }
  return runner.ensure(
    {
      userId,
      projectRef,
    },
    {
      repo: opts.repo,
      env: opts.env,
      image: opts.image,
      mounts: opts.mounts,
      addHostGateway: opts.addHostGateway,
    },
  );
}
