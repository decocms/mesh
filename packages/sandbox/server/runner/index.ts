/**
 * Public surface. Ships `DockerSandboxRunner` only via the default entry;
 * Freestyle sits behind its own subpath export (./runner/freestyle) because
 * its SDK is heavy and not every deploy needs it.
 */

import { spawnSync } from "node:child_process";
import { DockerSandboxRunner, type DockerRunnerOptions } from "./docker";
import type { RunnerStateStore } from "./state-store";
import type { RunnerKind, SandboxRunner } from "./types";

export type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  ProxyRequestInit,
  RunnerKind,
  Sandbox,
  SandboxId,
  SandboxRunner,
  Workload,
} from "./types";
export { sandboxIdKey } from "./types";
export { DockerSandboxRunner } from "./docker";
export type { DockerExec, DockerRunnerOptions, ExecResult } from "./docker";
export { ensureSandboxImage } from "../image-build";
export type { EnsureImageOptions } from "../image-build";
export { startLocalSandboxIngress } from "./docker";
export {
  sweepDockerOrphansOnBoot,
  sweepDockerOrphansOnShutdown,
} from "./docker";
export type { SweepDockerOrphansOnBootOptions } from "./docker";
export type {
  RunnerStateRecord,
  RunnerStateRecordWithId,
  RunnerStatePut,
  RunnerStateStore,
  RunnerStateStoreOps,
} from "./state-store";
export {
  composeSandboxRef,
  type AgentSandboxRefInput,
  type SandboxRefInput,
  type ThreadSandboxRefInput,
} from "./sandbox-ref";

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
 *   1. `FREESTYLE_API_KEY` set — pick freestyle.
 *   2. Otherwise — docker if CLI present, else null.
 */
export function tryResolveRunnerKindFromEnv(): RunnerKind | null {
  if (process.env.FREESTYLE_API_KEY) return "freestyle";
  return isDockerInstalled() ? "docker" : null;
}

/** Strict variant: throws with remediation hints when no runner is resolvable. */
export function resolveRunnerKindFromEnv(): RunnerKind {
  const kind = tryResolveRunnerKindFromEnv();
  if (kind) return kind;
  throw new Error(
    `No sandbox runner available: Docker CLI not found on PATH. ` +
      `Install Docker or set FREESTYLE_API_KEY.`,
  );
}
