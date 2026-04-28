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
  tryResolveRunnerKindFromEnv,
  type RunnerKind,
  type SandboxRunner,
} from "@decocms/sandbox/runner";
import { KyselySandboxRunnerStateStore } from "@/storage/sandbox-runner-state";

const runners: Partial<Record<RunnerKind, SandboxRunner>> = {};

// Set in prod (k8s/docker behind ingress) so the runner skips the local
// 127.0.0.1 port-forward path and emits a URL the user's browser can
// actually reach. Empty/unset = local forwarder fallback (dev).
function readPreviewUrlPattern(): string | undefined {
  const raw = process.env.MESH_SANDBOX_PREVIEW_URL_PATTERN;
  return raw && raw.trim() !== "" ? raw : undefined;
}

async function instantiate(
  kind: RunnerKind,
  ctx: MeshContext,
): Promise<SandboxRunner> {
  const stateStore = new KyselySandboxRunnerStateStore(ctx.db);
  const previewUrlPattern = readPreviewUrlPattern();
  switch (kind) {
    case "docker":
      return new DockerSandboxRunner({ stateStore, previewUrlPattern });
    case "freestyle": {
      // Dynamic import — freestyle SDK is an optionalDependency so
      // docker-only deploys don't need it installed.
      const { FreestyleSandboxRunner } = await import(
        "@decocms/sandbox/runner/freestyle"
      );
      return new FreestyleSandboxRunner({ stateStore });
    }
    case "kubernetes": {
      // Dynamic import — @kubernetes/client-node is heavy and only needed
      // when MESH_SANDBOX_RUNNER=kubernetes. Docker/Freestyle deploys never
      // load it.
      const { KubernetesSandboxRunner } = await import(
        "@decocms/sandbox/runner/k8s"
      );
      return new KubernetesSandboxRunner({ stateStore, previewUrlPattern });
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
  const kind = tryResolveRunnerKindFromEnv();
  if (!kind) return null;
  return runners[kind] ?? null;
}

/** Narrow to Docker for Docker-only methods (resolveDevPort / resolveDaemonPort). */
export function asDockerRunner(
  runner: SandboxRunner | null,
): DockerSandboxRunner | null {
  return runner instanceof DockerSandboxRunner ? runner : null;
}
