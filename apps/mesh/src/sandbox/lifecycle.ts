/**
 * Sandbox runner lifecycle.
 *
 * Owns the shared `SandboxRunner` singleton plus its boot and shutdown
 * sweeps. The singleton exists because `DockerSandboxRunner` holds in-memory
 * state — an `inflight` map that dedupes concurrent `ensure()` calls for the
 * same sandbox id, and a `byHandle` record cache. All callers (the `bash`
 * tool inside streaming conversations, the preview proxy at `/api/sandbox`,
 * the VM start/stop tools, and the local-ingress instance check) must share
 * one instance or they race each other against docker.
 *
 * Docker is the single-host, local-dev runner; production runs on K8s. Both
 * sweeps are therefore really about keeping `docker ps` clean across
 * `bun run dev` sessions, not production-grade lifecycle management.
 */

import type { MeshContext } from "@/core/mesh-context";
import {
  DockerSandboxRunner,
  type SandboxRunner,
  createRunner,
} from "mesh-plugin-user-sandbox/runner";
import { KyselySandboxRunnerStateStore } from "@/storage/sandbox-runner-state";

let sharedRunner: SandboxRunner | null = null;

export function getSharedRunner(ctx: MeshContext): SandboxRunner {
  if (!sharedRunner) {
    sharedRunner = createRunner({
      stateStore: new KyselySandboxRunnerStateStore(ctx.db),
    });
  }
  return sharedRunner;
}

/**
 * Return the singleton iff it's already been created. Used by the ingress
 * wiring to expose the runner for preview routing without forcing a
 * MeshContext (and therefore a DB connection) to exist before any request
 * has touched a sandbox.
 */
export function getSharedRunnerIfInit(): SandboxRunner | null {
  return sharedRunner;
}

// `bun --hot` re-runs the entry point's top-level awaits on every file save,
// which would otherwise stop the sandbox the user is actively previewing.
// `globalThis` survives module re-evaluation; a module-scoped flag does not.
// A full process restart (Ctrl+C → `bun run dev`) gets a fresh globalThis,
// so the sweep still runs when we actually want it to.
const BOOT_SWEEP_KEY = Symbol.for("mesh.sandbox.bootSweepDone");

/**
 * Sweep every container labelled `mesh-sandbox=1` on the local docker daemon.
 * Called once per process at boot, so a fresh `bun run dev` starts with an
 * empty `docker ps` — prior runs that crashed or were SIGKILL'd leave
 * containers behind, and shutdown-time cleanup can't cover those paths.
 * No-op on HMR module reloads and when docker isn't the runner.
 */
export async function sweepSandboxesOnBoot(): Promise<void> {
  if (process.env.MESH_SANDBOX_RUNNER !== "docker") return;
  const g = globalThis as Record<symbol, unknown>;
  if (g[BOOT_SWEEP_KEY]) return;
  g[BOOT_SWEEP_KEY] = true;
  try {
    // Throwaway instance: we don't have a MeshContext at boot, and
    // sweepOrphans() queries docker directly without touching the state store.
    const runner = new DockerSandboxRunner();
    const n = await runner.sweepOrphans();
    if (n > 0) {
      console.log(`[sandbox] Boot sweep: stopped ${n} stale container(s).`);
    }
  } catch (err) {
    console.warn(
      "[sandbox] Boot sweep failed (continuing without it):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Sweep sandbox containers at shutdown. Uses the shared runner because the
 * state store is written to during sweep. No-op if no request ever touched
 * a sandbox — nothing was provisioned, nothing to sweep.
 *
 * Containers are `docker run --rm`, so stopping them auto-removes them;
 * without this sweep they'd keep running after mesh exits.
 *
 * Caveat: filters ONLY by the shared `mesh-sandbox=1` label, so if multiple
 * mesh pods ever share one docker host, each pod's SIGTERM will nuke the
 * others' containers. Fine for single-pod-per-host; revisit with a per-pod
 * label when we go multi-tenant on one host.
 */
export async function sweepSandboxesOnShutdown(): Promise<void> {
  if (!sharedRunner) return;
  console.log("[shutdown] Sweeping sandbox containers...");
  try {
    const n = await sharedRunner.sweepOrphans();
    console.log(`[shutdown] Swept ${n} sandbox container(s).`);
  } catch (err) {
    console.error("[shutdown] Sandbox sweep error:", err);
  }
}
