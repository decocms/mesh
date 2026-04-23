export interface SandboxId {
  userId: string;
  projectRef: string;
}

/**
 * Opaque handle returned from `ensure()` and passed back to `exec()`/`delete()`.
 * The transport (HTTP daemon, kube exec, ssh) lives inside the runner — callers
 * never see it.
 */
export interface Sandbox {
  handle: string;
  workdir: string;
}

/**
 * Mount request for `docker run -v`. Two kinds:
 *  - `"bind"`  — host path mounted into the container. `source` must exist.
 *  - `"volume"` — named docker volume. Docker auto-creates on first use; the
 *    runner records the name and removes the volume on `delete`/`sweepOrphans`
 *    so volume lifetime tracks the sandbox.
 */
export interface Mount {
  kind: "bind" | "volume";
  source: string;
  target: string;
  readOnly?: boolean;
}

export interface EnsureOptions {
  image?: string;
  env?: Record<string, string>;
  workdir?: string;
  /**
   * Optional repo to clone on first provisioning. Runners that don't support
   * this (current docker image) MUST ignore it rather than erroring.
   *
   * `branch` is the git branch the sandbox should end up on. When provided,
   * the runner checks it out after clone: fetching from origin when the
   * remote has it, otherwise creating it locally off the default branch.
   * When absent, whatever branch the clone produced (typically the repo's
   * default) is kept.
   */
  repo?: {
    cloneUrl: string;
    userName: string;
    userEmail: string;
    branch?: string;
  };
  /**
   * Extra bind mounts + named volumes to attach at `docker run`. Only applied
   * on fresh provision — existing containers keep their original mount set.
   * Runners that can't honor this (freestyle) MUST ignore rather than error.
   */
  mounts?: Mount[];
  /**
   * Add `--add-host=host.docker.internal:host-gateway`. Set when code inside
   * the container needs to reach services bound on the host loopback. Like
   * `mounts`, only applied on fresh provision.
   */
  addHostGateway?: boolean;
}

export interface ExecInput {
  command: string;
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface SandboxRunner {
  ensure(id: SandboxId, opts?: EnsureOptions): Promise<Sandbox>;
  exec(handle: string, input: ExecInput): Promise<ExecOutput>;
  delete(handle: string): Promise<void>;
  alive(handle: string): Promise<boolean>;
  sweepOrphans(): Promise<number>;
}

export function sandboxIdKey(id: SandboxId): string {
  return `${id.userId}:${id.projectRef}`;
}
