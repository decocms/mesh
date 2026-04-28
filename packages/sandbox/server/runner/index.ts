/**
 * Public surface. Ships `DockerSandboxRunner` only via the default entry;
 * Freestyle and agent-sandbox sit behind their own subpath exports (./runner/
 * freestyle, ./runner/agent-sandbox) because their SDKs are heavy and not
 * every deploy needs them.
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
 *   1. `STUDIO_SANDBOX_RUNNER=docker|freestyle|agent-sandbox` — honored.
 *   2. No explicit value, `FREESTYLE_API_KEY` set — pick freestyle.
 *   3. Production w/o explicit value and no freestyle key — null.
 *   4. Dev w/o explicit value — docker if CLI present, else null.
 *
 * agent-sandbox is explicit-only: never auto-selected — callers must opt in
 * with `STUDIO_SANDBOX_RUNNER=agent-sandbox` so docker-only dev stays the default.
 */
export function tryResolveRunnerKindFromEnv(): RunnerKind | null {
  const raw = process.env.STUDIO_SANDBOX_RUNNER;
  if (raw === "docker" || raw === "freestyle" || raw === "agent-sandbox") {
    return raw;
  }
  if (raw && raw.length > 0) {
    throw new Error(
      `Unknown STUDIO_SANDBOX_RUNNER="${raw}" — expected "docker", "freestyle", or "agent-sandbox".`,
    );
  }
  if (process.env.FREESTYLE_API_KEY) return "freestyle";
  if (process.env.NODE_ENV === "production") return null;
  return isDockerInstalled() ? "docker" : null;
}

/** Strict variant: throws with remediation hints when no runner is resolvable. */
export function resolveRunnerKindFromEnv(): RunnerKind {
  const kind = tryResolveRunnerKindFromEnv();
  if (kind) return kind;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `STUDIO_SANDBOX_RUNNER must be set explicitly in production — ` +
        `choose "docker", "freestyle", or "agent-sandbox" (or set FREESTYLE_API_KEY).`,
    );
  }
  throw new Error(
    `No sandbox runner available: Docker CLI not found on PATH. ` +
      `Install Docker for local dev, or set STUDIO_SANDBOX_RUNNER explicitly.`,
  );
}
