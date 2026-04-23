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

/**
 * Read `MESH_SANDBOX_RUNNER`. Default `freestyle` (production today).
 */
export function resolveRunnerKindFromEnv(): RunnerKind {
  const raw = process.env.MESH_SANDBOX_RUNNER;
  if (raw === "docker" || raw === "freestyle") return raw;
  return "freestyle";
}
