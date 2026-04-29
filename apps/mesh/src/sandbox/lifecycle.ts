/**
 * Runner singletons, one per kind. VM_DELETE dispatches on the entry's
 * recorded runnerKind (not env), so a pod that flipped STUDIO_SANDBOX_RUNNER
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
import { getDb } from "@/database";
import type { Kysely } from "kysely";
import { meter } from "@/observability";
import type { Database as DatabaseSchema } from "@/storage/types";
import { KyselySandboxRunnerStateStore } from "@/storage/sandbox-runner-state";

const runners: Partial<Record<RunnerKind, SandboxRunner>> = {};
// In-flight instantiate() promises, memoized per kind. Two concurrent
// callers on a cold mesh would otherwise both miss the resolved-runner
// cache and both call instantiate(); memoizing the promise (and only
// promoting to `runners` once it resolves) collapses them to a single
// build. Cleared on failure so a retry can take a fresh swing.
const inflight: Partial<Record<RunnerKind, Promise<SandboxRunner>>> = {};

function resolveOnce(
  kind: RunnerKind,
  build: () => Promise<SandboxRunner>,
): Promise<SandboxRunner> {
  const cached = runners[kind];
  if (cached) return Promise.resolve(cached);
  const pending = inflight[kind];
  if (pending) return pending;
  const promise = build()
    .then((runner) => {
      runners[kind] = runner;
      return runner;
    })
    .finally(() => {
      delete inflight[kind];
    });
  inflight[kind] = promise;
  return promise;
}

// Set in prod (k8s/docker behind ingress) so the runner skips the local
// 127.0.0.1 port-forward path and emits a URL the user's browser can
// actually reach. Empty/unset = local forwarder fallback (dev).
function readPreviewUrlPattern(): string | undefined {
  const raw = process.env.STUDIO_SANDBOX_PREVIEW_URL_PATTERN;
  return raw && raw.trim() !== "" ? raw : undefined;
}

// Per-env SandboxTemplate name. The sandbox-env Helm chart suffixes the
// template name with envName so multiple envs share `agent-sandbox-system`
// without collisions; mesh in this env must point its claims at the
// matching suffixed name. Empty/unset → AgentSandboxRunner's built-in
// default ("studio-sandbox") so single-env installs that didn't suffix
// keep working.
function readSandboxTemplateName(): string | undefined {
  const raw = process.env.STUDIO_SANDBOX_TEMPLATE_NAME;
  return raw && raw.trim() !== "" ? raw : undefined;
}

// Per-claim HTTPRoute attaches to this Gateway. When set together with
// STUDIO_SANDBOX_PREVIEW_URL_PATTERN, mesh mints one HTTPRoute per
// SandboxClaim so the wildcard Gateway can route directly to each
// sandbox's Service:9000 (mesh leaves the data path). Both vars unset →
// the runner falls back to in-process preview proxying via mesh.
function readPreviewGateway(): { name: string; namespace: string } | undefined {
  const name = process.env.STUDIO_SANDBOX_PREVIEW_GATEWAY_NAME?.trim();
  const namespace =
    process.env.STUDIO_SANDBOX_PREVIEW_GATEWAY_NAMESPACE?.trim();
  if (!name || !namespace) return undefined;
  return { name, namespace };
}

async function instantiate(
  kind: RunnerKind,
  db: Kysely<DatabaseSchema>,
): Promise<SandboxRunner> {
  const stateStore = new KyselySandboxRunnerStateStore(db);
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
    case "agent-sandbox": {
      // Dynamic import — @kubernetes/client-node is heavy and only needed
      // when STUDIO_SANDBOX_RUNNER=agent-sandbox. Docker/Freestyle deploys never
      // load it.
      const { AgentSandboxRunner } = await import(
        "@decocms/sandbox/runner/agent-sandbox"
      );
      // `meter` is reassigned by initObservability() after sdk.start(); read
      // it at runner construction (post-init) so we get the real instruments
      // not the no-op evaluated at module load.
      return new AgentSandboxRunner({
        stateStore,
        previewUrlPattern,
        sandboxTemplateName: readSandboxTemplateName(),
        previewGateway: readPreviewGateway(),
        meter,
      });
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
export function getRunnerByKind(
  ctx: MeshContext,
  kind: RunnerKind,
): Promise<SandboxRunner> {
  return resolveOnce(kind, () => instantiate(kind, ctx.db));
}

/**
 * Eager runner accessor for paths that need the runner before any user
 * request — preview-host proxying at the Bun.serve layer is the only caller
 * today. Reads the runner kind from env and constructs without a
 * MeshContext (the state store only needs a Kysely instance). Returns null
 * when no runner kind is configured.
 */
export async function getOrInitSharedRunner(): Promise<SandboxRunner | null> {
  const kind = tryResolveRunnerKindFromEnv();
  if (!kind) return null;
  return resolveOnce(kind, () => instantiate(kind, getDb().db));
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
