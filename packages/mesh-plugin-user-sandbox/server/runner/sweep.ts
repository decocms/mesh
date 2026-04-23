/**
 * Docker sandbox sweeps.
 *
 * Both sweeps are Docker-specific by design — `docker run --rm` containers
 * are pets the mesh process spawned, and if mesh exits without stopping
 * them they leak. Other runners produce sandboxes that are independently
 * managed (Freestyle bills idle VMs out of band; Kubernetes pods are
 * first-class cluster workloads), so a polymorphic "sweep on shutdown"
 * concept doesn't apply to them — and would actively be wrong: a mesh pod
 * being rolling-restarted in K8s would otherwise nuke every active user
 * sandbox.
 *
 * `sweepOrphans` therefore lives on `DockerSandboxRunner` only, not on
 * the `SandboxRunner` interface.
 */

import { DockerSandboxRunner, type DockerRunnerOptions } from "./docker";

const BOOT_SWEEP_KEY = Symbol.for("mesh.sandbox.bootSweepDone");

export type SweepDockerOrphansOnBootOptions = Pick<
  DockerRunnerOptions,
  "labelPrefix" | "exec"
>;

/**
 * Sweep stale docker sandbox containers at boot. Stops every container
 * the local docker daemon labels with `mesh-sandbox=1` (or whatever
 * `labelPrefix` is configured). Called once per process so a fresh
 * `bun run dev` starts with an empty `docker ps` — prior runs that
 * crashed or were SIGKILL'd leave containers behind, and shutdown-time
 * cleanup can't cover those paths.
 *
 * The runner is constructed throwaway here: `sweepOrphans()` queries
 * docker directly via labels, so it doesn't need a state store or a
 * `MeshContext`. The shared singleton in the host app is lazy-init'd
 * on first sandbox use, which is much later than boot.
 *
 * `bun --hot` re-runs the entry point's top-level awaits on every file
 * save, which would otherwise stop the sandbox the user is actively
 * previewing. `globalThis` survives module re-evaluation; a module-scoped
 * flag does not. A full process restart (Ctrl+C → `bun run dev`) gets a
 * fresh globalThis, so the sweep still runs when we actually want it to.
 *
 * Failures (docker CLI missing, daemon down, sweep errors) are logged
 * and swallowed — the boot sweep is best-effort, never blocks startup.
 */
export async function sweepDockerOrphansOnBoot(
  opts: SweepDockerOrphansOnBootOptions = {},
): Promise<void> {
  const g = globalThis as Record<symbol, unknown>;
  if (g[BOOT_SWEEP_KEY]) return;
  g[BOOT_SWEEP_KEY] = true;
  try {
    const runner = new DockerSandboxRunner(opts);
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
 * Sweep sandbox containers at process shutdown. No-op when no docker
 * runner singleton was constructed in this process (no request ever
 * touched a docker sandbox → nothing to sweep).
 *
 * Caveat: filters ONLY by the shared `mesh-sandbox=1` label, so if
 * multiple mesh pods ever share one docker host, each pod's SIGTERM
 * will nuke the others' containers. Fine for single-pod-per-host
 * (the only deployment shape where docker is a sane runner anyway);
 * revisit with a per-pod label if that ever changes.
 */
export async function sweepDockerOrphansOnShutdown(
  runner: DockerSandboxRunner | null,
): Promise<void> {
  if (!runner) return;
  console.log("[shutdown] Sweeping docker sandbox containers...");
  try {
    const n = await runner.sweepOrphans();
    if (n > 0) {
      console.log(`[shutdown] Swept ${n} sandbox container(s).`);
    }
  } catch (err) {
    console.error("[shutdown] Sandbox sweep error:", err);
  }
}
