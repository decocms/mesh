/**
 * Sandbox runner package public surface.
 *
 * Exports:
 *  - The `SandboxRunner` interface every runner implements.
 *  - `DockerSandboxRunner` (the only first-party runner that ships in this
 *    package — Docker has no apps/mesh-level deps).
 *  - `composeSandboxRef` and supporting types — single source of truth for
 *    `projectRef` encoding.
 *  - State-store contracts so host apps can plug their own persistence.
 *
 * Other runners (Freestyle, Kubernetes, …) live in apps/mesh because their
 * SDKs introduce dependencies that don't belong in this package's surface.
 * They implement the `SandboxRunner` interface re-exported here and slot
 * into the host app's `getRunnerByKind` factory.
 */

import { spawnSync } from "node:child_process";
import { DockerSandboxRunner, type DockerRunnerOptions } from "./docker";
import type { RunnerStateStore } from "./state-store";
import type { SandboxRunner } from "./types";

export type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  ProxyRequestInit,
  Sandbox,
  SandboxId,
  SandboxRunner,
  Workload,
} from "./types";
export { sandboxIdKey } from "./types";
export { DockerSandboxRunner } from "./docker";
export type { DockerExec, DockerRunnerOptions, ExecResult } from "./docker";
export { startLocalSandboxIngress } from "./local-ingress";
export {
  sweepDockerOrphansOnBoot,
  sweepDockerOrphansOnShutdown,
} from "./sweep";
export type { SweepDockerOrphansOnBootOptions } from "./sweep";
export type {
  RunnerStateRecord,
  RunnerStateRecordWithId,
  RunnerStatePut,
  RunnerStateStore,
} from "./state-store";
export {
  composeSandboxRef,
  type AgentSandboxRefInput,
  type SandboxRefInput,
  type ThreadSandboxRefInput,
} from "./sandbox-ref";

/**
 * Runner kinds the system knows about. Used as the discriminator on
 * `SandboxRunner.kind`, on `sandbox_runner_state.runner_kind`, and on
 * `vmMap` entries. Keep in sync with each runner's `readonly kind`.
 */
export type RunnerKind = "docker" | "freestyle";

export interface CreateDockerRunnerOptions {
  stateStore?: RunnerStateStore;
  docker?: Omit<DockerRunnerOptions, "stateStore">;
}

/**
 * Construct a `DockerSandboxRunner` with an injected state store. Convenience
 * for host apps that wire only the in-package runner directly. For runners
 * that live in apps/mesh (Freestyle), construct the class explicitly.
 */
export function createDockerRunner(
  opts: CreateDockerRunnerOptions = {},
): SandboxRunner {
  return new DockerSandboxRunner({
    ...opts.docker,
    stateStore: opts.stateStore,
  });
}

let cachedDockerInstalled: boolean | null = null;

/**
 * Best-effort probe: is the `docker` CLI on PATH? We only care that the
 * binary exists — actually reaching the daemon is a separate concern that
 * surfaces at first use. Cached after the first call because this runs on
 * every `resolveRunnerKindFromEnv()` in the default-local path.
 */
function isDockerInstalled(): boolean {
  if (cachedDockerInstalled !== null) return cachedDockerInstalled;
  try {
    const result = spawnSync("docker", ["--version"], {
      stdio: "ignore",
      timeout: 2000,
    });
    cachedDockerInstalled = result.status === 0;
  } catch {
    cachedDockerInstalled = false;
  }
  return cachedDockerInstalled;
}

/**
 * Resolve the active runner kind.
 *
 * Rules:
 *   1. `MESH_SANDBOX_RUNNER=docker|freestyle` — explicit, always honored.
 *   2. Production with no explicit value — throw. Operators must opt in
 *      to a runner; we do not silently pick one for a production deploy.
 *   3. Local dev with no explicit value — `docker` when the CLI is on
 *      PATH. If not, throw with a message asking the operator to install
 *      Docker or set the env explicitly.
 *
 * Freestyle is never picked implicitly — the SDK is an optional dependency
 * and its runner is dynamically imported by the host app only when selected.
 */
export function resolveRunnerKindFromEnv(): RunnerKind {
  const raw = process.env.MESH_SANDBOX_RUNNER;
  if (raw === "docker" || raw === "freestyle") return raw;
  if (raw && raw.length > 0) {
    throw new Error(
      `Unknown MESH_SANDBOX_RUNNER="${raw}" — expected "docker" or "freestyle".`,
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `MESH_SANDBOX_RUNNER must be set explicitly in production — ` +
        `choose "docker" or "freestyle".`,
    );
  }
  if (isDockerInstalled()) return "docker";
  throw new Error(
    `No sandbox runner available: Docker CLI not found on PATH. ` +
      `Install Docker for local dev, or set MESH_SANDBOX_RUNNER explicitly.`,
  );
}
