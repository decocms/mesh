/**
 * Sandbox runner lifecycle.
 *
 * Owns the per-kind `SandboxRunner` singletons. The singletons exist
 * because runners hold in-memory state — Docker has an `inflight` dedupe
 * map and a `byHandle` cache; Freestyle holds a `byHandle` cache for
 * resume-without-DB-roundtrip. All callers (the `bash` tool inside
 * streaming conversations, the preview proxy at `/api/sandbox`, the VM
 * start/stop tools, and the Docker local-ingress forwarder in
 * `mesh-plugin-user-sandbox/runner`) must share one instance per kind or
 * they race each other.
 *
 * Why per-kind: VM_DELETE dispatches on the entry's `runnerKind` (persisted
 * at VM_START time) so a pod that flips `MESH_SANDBOX_RUNNER` between start
 * and stop still tears down the right kind of VM. Means we may construct
 * both runners on the same process even though only one is actively used
 * for new sandboxes.
 *
 * Docker is the single-host, local-dev runner; production runs on Freestyle
 * (and, ahead, on Kubernetes). Boot/shutdown sweeps are Docker-specific
 * and live in the plugin (`sweepDockerOrphansOnBoot` /
 * `sweepDockerOrphansOnShutdown`) — other runners produce sandboxes that
 * outlive the mesh process by design (Freestyle bills idle VMs out of
 * band; K8s pods are first-class cluster workloads), so a generic
 * "sweep on shutdown" would be wrong, not just unnecessary.
 */

import type { MeshContext } from "@/core/mesh-context";
import {
  DockerSandboxRunner,
  resolveRunnerKindFromEnv,
  type RunnerKind,
  type SandboxRunner,
} from "mesh-plugin-user-sandbox/runner";
import { KyselySandboxRunnerStateStore } from "@/storage/sandbox-runner-state";

const runners: Partial<Record<RunnerKind, SandboxRunner>> = {};

async function instantiate(
  kind: RunnerKind,
  ctx: MeshContext,
): Promise<SandboxRunner> {
  const stateStore = new KyselySandboxRunnerStateStore(ctx.db);
  switch (kind) {
    case "docker":
      return new DockerSandboxRunner({ stateStore });
    case "freestyle": {
      // Dynamic import keeps `freestyle-sandboxes` (and the `@freestyle-sh/*`
      // helpers it pulls in) out of the module graph on docker-only deploys.
      // Those packages are listed as `optionalDependencies` in
      // `apps/mesh/package.json` — operators who don't opt in to freestyle
      // never need to install them.
      const { FreestyleSandboxRunner } = await import("./freestyle-runner");
      return new FreestyleSandboxRunner({ stateStore });
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown runner kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Return the singleton runner for the active env-selected kind. Lazy-init
 * on first call. Used by VM_START + the daemon-proxy route + decopilot's
 * VM tools where we always want the current configuration.
 */
export function getSharedRunner(ctx: MeshContext): Promise<SandboxRunner> {
  return getRunnerByKind(ctx, resolveRunnerKindFromEnv());
}

/**
 * Return the singleton runner for a specific kind. VM_DELETE uses this so
 * teardown follows the entry's recorded `runnerKind` instead of the
 * (possibly different) current env config.
 */
export async function getRunnerByKind(
  ctx: MeshContext,
  kind: RunnerKind,
): Promise<SandboxRunner> {
  const cached = runners[kind];
  if (cached) return cached;
  const runner = await instantiate(kind, ctx);
  runners[kind] = runner;
  return runner;
}

/**
 * Return the active runner iff already created. Used by the local-ingress
 * wiring to expose the runner for preview routing without forcing a
 * MeshContext (and therefore a DB connection) before any request has
 * touched a sandbox. Safe to call before env resolution has succeeded —
 * returns null if the env is unresolved.
 */
export function getSharedRunnerIfInit(): SandboxRunner | null {
  let kind: RunnerKind;
  try {
    kind = resolveRunnerKindFromEnv();
  } catch {
    return null;
  }
  return runners[kind] ?? null;
}

/**
 * Convenience for callers that need to assert a runner is Docker before
 * touching Docker-only methods (`resolveDevPort`, `resolveDaemonPort` —
 * used by the local ingress proxy). Returns the typed instance or `null`.
 */
export function asDockerRunner(
  runner: SandboxRunner | null,
): DockerSandboxRunner | null {
  return runner instanceof DockerSandboxRunner ? runner : null;
}
