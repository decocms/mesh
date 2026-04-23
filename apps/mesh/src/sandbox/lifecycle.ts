/**
 * Runner singletons, one per kind. VM_DELETE dispatches on the entry's
 * recorded runnerKind (not env), so a pod that flipped MESH_SANDBOX_RUNNER
 * between start and stop still tears down the right kind of VM.
 * Boot/shutdown sweeps are Docker-only — other runners' sandboxes outlive
 * mesh by design, so a generic sweep would nuke active user VMs.
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
      // Dynamic import — freestyle SDK is an optionalDependency so
      // docker-only deploys don't need it installed.
      const { FreestyleSandboxRunner } = await import("./freestyle-runner");
      return new FreestyleSandboxRunner({ stateStore });
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown runner kind: ${String(exhaustive)}`);
    }
  }
}

export function getSharedRunner(ctx: MeshContext): Promise<SandboxRunner> {
  return getRunnerByKind(ctx, resolveRunnerKindFromEnv());
}

/** VM_DELETE uses this so teardown follows the entry's recorded runnerKind. */
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
 * Return the active runner iff already constructed — avoids forcing a
 * MeshContext (and DB connection) before any request touches a sandbox.
 * Returns null if env is unresolved.
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

/** Narrow to Docker for Docker-only methods (resolveDevPort / resolveDaemonPort). */
export function asDockerRunner(
  runner: SandboxRunner | null,
): DockerSandboxRunner | null {
  return runner instanceof DockerSandboxRunner ? runner : null;
}
