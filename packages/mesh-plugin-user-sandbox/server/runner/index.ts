/**
 * Public surface. Ships `DockerSandboxRunner` only — runners with heavy SDKs
 * (Freestyle, K8s) live in apps/mesh and slot into `getRunnerByKind`.
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
 * Discriminator used on `SandboxRunner.kind`, `sandbox_runner_state.runner_kind`,
 * and `vmMap` entries. Keep in sync with each runner's `readonly kind`.
 */
export type RunnerKind = "docker" | "freestyle";

export interface CreateDockerRunnerOptions {
  stateStore?: RunnerStateStore;
  docker?: Omit<DockerRunnerOptions, "stateStore">;
}

/** Convenience for host apps wiring only the in-package runner. */
export function createDockerRunner(
  opts: CreateDockerRunnerOptions = {},
): SandboxRunner {
  return new DockerSandboxRunner({
    ...opts.docker,
    stateStore: opts.stateStore,
  });
}

let cachedDockerInstalled: boolean | null = null;

/** Probes only the CLI presence (not daemon reachability). Cached. */
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
 * Rules:
 *   1. `MESH_SANDBOX_RUNNER=docker|freestyle` — honored.
 *   2. Production w/o explicit value — throw (no silent picks in prod).
 *   3. Dev w/o explicit value — docker if CLI present, else throw.
 * Freestyle is never picked implicitly (optional dep, dynamically imported).
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
