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

export interface EnsureOptions {
  image?: string;
  env?: Record<string, string>;
  workdir?: string;
  /**
   * Optional repo to clone on first provisioning. Runners that don't support
   * this (current docker image) MUST ignore it rather than erroring.
   */
  repo?: {
    cloneUrl: string;
    userName: string;
    userEmail: string;
  };
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
  /**
   * Return a base URL the mesh process can use to reach the sandbox daemon.
   * All dev-server traffic is proxied through the daemon via its `/proxy/:port/*`
   * endpoint — no extra host ports are published. Returns null for runners
   * that don't expose a daemon (e.g. Freestyle with its own domain).
   */
  resolveDaemonUrl?(handle: string): Promise<string | null>;
  /**
   * Daemon bearer token for server-to-server calls. The mesh preview proxy
   * attaches this when forwarding requests into the container. Never surfaced
   * to the browser. Returns null for runners that don't use a daemon.
   */
  resolveDaemonToken?(handle: string): Promise<string | null>;
}

export function sandboxIdKey(id: SandboxId): string {
  return `${id.userId}:${id.projectRef}`;
}
