import { DockerSandboxRunner, type DockerRunnerOptions } from "./docker";
import {
  FreestyleSandboxRunner,
  type FreestyleRunnerOptions,
} from "./freestyle";
import type { RunnerStateStore } from "./state-store";
import type { SandboxRunner } from "./types";

export type {
  EnsureOptions,
  ExecInput,
  ExecOutput,
  Mount,
  Sandbox,
  SandboxId,
  SandboxRunner,
} from "./types";
export { sandboxIdKey } from "./types";
export { DockerSandboxRunner } from "./docker";
export type { DockerExec, DockerRunnerOptions, ExecResult } from "./docker";
export { FreestyleSandboxRunner } from "./freestyle";
export type { FreestyleRunnerOptions } from "./freestyle";
export type {
  RunnerStateRecord,
  RunnerStateRecordWithId,
  RunnerStatePut,
  RunnerStateStore,
} from "./state-store";
export { ensureSandbox } from "../ensure-sandbox";
export type { SandboxToolContext } from "../ensure-sandbox";

export type RunnerKind = "docker" | "freestyle";

export interface CreateRunnerOptions {
  /** Override env-derived selection. */
  kind?: RunnerKind;
  stateStore?: RunnerStateStore;
  docker?: Omit<DockerRunnerOptions, "stateStore">;
  freestyle?: Omit<FreestyleRunnerOptions, "stateStore">;
}

/**
 * Pick a runner based on MESH_SANDBOX_RUNNER (default: docker).
 *
 * The factory is intentionally tiny — any routing logic beyond env-var
 * selection belongs at the call site, not here.
 */
export function createRunner(opts: CreateRunnerOptions = {}): SandboxRunner {
  const kind =
    opts.kind ??
    (process.env.MESH_SANDBOX_RUNNER as RunnerKind | undefined) ??
    "docker";
  if (kind === "freestyle") {
    return new FreestyleSandboxRunner({
      ...opts.freestyle,
      stateStore: opts.stateStore,
    });
  }
  if (kind === "docker") {
    return new DockerSandboxRunner({
      ...opts.docker,
      stateStore: opts.stateStore,
    });
  }
  throw new Error(`Unknown MESH_SANDBOX_RUNNER: ${kind satisfies never}`);
}
