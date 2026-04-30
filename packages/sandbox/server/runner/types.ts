/**
 * Runner-agnostic interface. Callers never branch on kind; runner-specific
 * features (local-ingress ports, Docker volumes) live on concrete classes.
 */

export interface SandboxId {
  userId: string;
  /** Opaque routing key; compose via `composeSandboxRef()`. */
  projectRef: string;
}

/** Opaque handle; transport (HTTP/kube-exec/ssh) stays inside the runner. */
export interface Sandbox {
  handle: string;
  workdir: string;
  /**
   * Same as `runner.getPreviewUrl(handle)`, returned eagerly. Non-null as
   * long as the sandbox exists — the iframe may still show a connection
   * error if the dev server inside never binds (e.g. repo has no `dev`/
   * `start` script), which is what the UI's booting/ready state tracks.
   */
  previewUrl: string | null;
}

/** When omitted, no dev server is started; runner uses its default image (tool sandboxes). */
export interface Workload {
  runtime: "node" | "bun" | "deno";
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  /** Container-internal dev port. */
  devPort: number;
}

export interface EnsureOptions {
  /**
   * Optional first-provisioning clone. Runners without clone support MUST
   * ignore (not error). `branch` post-clone: fetch-from-origin-or-create.
   */
  repo?: {
    cloneUrl: string;
    userName: string;
    userEmail: string;
    branch?: string;
    /** Human-readable label for logs/UI; no functional effect. */
    displayName?: string;
  };
  /** Image override. Non-image runners (Freestyle) MUST ignore. */
  image?: string;
  workload?: Workload;
  /** Frozen for the sandbox's lifetime — changing requires recreate. */
  env?: Record<string, string>;
  /**
   * Tenant identity for cost attribution. Runners MAY surface these as
   * platform-native metadata (k8s pod labels, Docker container labels) so
   * downstream metrics pipelines can attribute resource usage to the owning
   * org/user. Optional — callers without an org context (smoke tests, internal
   * tool sandboxes) leave it unset and pods get only platform-level labels.
   */
  tenant?: {
    orgId: string;
    userId: string;
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

export interface ProxyRequestInit {
  method: string;
  headers: Headers;
  body: BodyInit | null;
  signal?: AbortSignal;
}

/**
 * Persisted on `vmMap` and `sandbox_runner_state.runner_kind`. When widening,
 * keep `VmMapEntry.runnerKind` in sync.
 */
export type RunnerKind = "host" | "docker" | "freestyle" | "agent-sandbox";

export interface SandboxRunner {
  readonly kind: RunnerKind;

  ensure(id: SandboxId, opts?: EnsureOptions): Promise<Sandbox>;
  exec(handle: string, input: ExecInput): Promise<ExecOutput>;
  delete(handle: string): Promise<void>;
  alive(handle: string): Promise<boolean>;

  /** Null when no workload was requested or the sandbox isn't running. */
  getPreviewUrl(handle: string): Promise<string | null>;

  /**
   * Passthrough to the daemon control plane. Path is daemon-internal; runners
   * translate (Docker prepends `/_daemon`, Freestyle base64-encodes for CF WAF).
   * Bearer tokens stay inside the runner.
   */
  proxyDaemonRequest(
    handle: string,
    path: string,
    init: ProxyRequestInit,
  ): Promise<Response>;
}

export function sandboxIdKey(id: SandboxId): string {
  return `${id.userId}:${id.projectRef}`;
}
