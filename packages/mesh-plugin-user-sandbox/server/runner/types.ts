/**
 * Runner-agnostic sandbox interface.
 *
 * Three runners implement this today:
 *  - `DockerSandboxRunner` — local containers + ephemeral host ports
 *  - `FreestyleSandboxRunner` — Freestyle VMs with a public preview domain
 *  - (future) `KubernetesSandboxRunner` — SandboxClaims via the agent-sandbox operator
 *
 * Callers never branch on the runner kind. Anything that's only meaningful for
 * one runner (e.g. local-ingress port resolution, Docker volumes) lives on
 * that runner's concrete class, not on this interface.
 */

export interface SandboxId {
  userId: string;
  /**
   * Opaque routing key. New shape:
   *   `agent:<orgId>:<virtualMcpId>:<branch>` — agent-thread sandboxes.
   *   `thread:<threadId>` — non-agent ad-hoc sandboxes.
   *
   * Compose via `composeSandboxRef()` so encoding stays in one place.
   */
  projectRef: string;
}

/**
 * Opaque handle returned from `ensure()` and passed back to other methods.
 * The transport (HTTP daemon, kube exec, ssh) lives inside the runner —
 * callers never see it.
 */
export interface Sandbox {
  handle: string;
  workdir: string;
  /**
   * Public URL the browser uses to reach the sandbox's dev server. Same
   * value as `runner.getPreviewUrl(handle)`, returned eagerly so callers
   * don't need a second roundtrip after `ensure()`. `null` when no
   * `workload` was requested (blank sandbox / LLM tool sandbox without a
   * dev server).
   */
  previewUrl: string | null;
}

/**
 * Workload metadata. When set, the runner ensures the chosen image/spec
 * supports `runtime` and exposes `devPort` via `Sandbox.previewUrl`. When
 * omitted, no dev server is started and the runner uses its default base
 * image — useful for ad-hoc tool sandboxes (curl, jq, python3).
 */
export interface Workload {
  runtime: "node" | "bun" | "deno";
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "deno";
  /** Port the dev server binds inside the container/VM. */
  devPort: number;
}

export interface EnsureOptions {
  /**
   * Optional repo to clone on first provisioning. Runners that don't
   * support cloning MUST ignore rather than erroring.
   *
   * `branch` is the git branch the sandbox should end up on. When provided,
   * the runner checks it out after clone: fetching from origin when the
   * remote has it, otherwise creating it locally off the default branch.
   */
  repo?: {
    cloneUrl: string;
    userName: string;
    userEmail: string;
    branch?: string;
    /**
     * Display label for the repo, used in daemon logs and UI hints. When
     * absent, runners derive a label from `cloneUrl`. Has no functional
     * effect on the sandbox — purely for human-readable output.
     */
    displayName?: string;
  };
  /**
   * Image/spec override. When set, the runner uses this image instead of
   * the one it would pick from `workload`. Lets callers spin up arbitrary
   * toolsets ("python:3.12-slim", a custom image with curl + jq + grep).
   * Runners that aren't image-based (Freestyle's VmSpec) MUST ignore.
   */
  image?: string;
  /**
   * Workload metadata. See `Workload`.
   */
  workload?: Workload;
  /**
   * Env vars injected at provision time. Runners pass them to the
   * container/VM environment, so they're frozen for its lifetime —
   * changing values requires a recreate.
   */
  env?: Record<string, string>;
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

/**
 * Initialization options for `proxyDaemonRequest`. A subset of `RequestInit`
 * that captures what the existing proxies actually pass through.
 */
export interface ProxyRequestInit {
  method: string;
  headers: Headers;
  body: BodyInit | null;
  signal?: AbortSignal;
}

export interface SandboxRunner {
  /**
   * Stable identifier for the runner kind, persisted on `vmMap` entries
   * and on `sandbox_runner_state.runner_kind`. Widen this union when a
   * new runner ships (e.g. `"kubernetes"`); keep `VmMapEntry.runnerKind`
   * + `RunnerKind` (in `runner/index.ts`) in sync.
   */
  readonly kind: "docker" | "freestyle";

  ensure(id: SandboxId, opts?: EnsureOptions): Promise<Sandbox>;
  exec(handle: string, input: ExecInput): Promise<ExecOutput>;
  delete(handle: string): Promise<void>;
  alive(handle: string): Promise<boolean>;

  /**
   * Public URL the browser uses to reach the sandbox's dev server. `null`
   * when no `workload` was requested or the sandbox isn't running.
   */
  getPreviewUrl(handle: string): Promise<string | null>;

  /**
   * HTTP passthrough to the sandbox daemon's control plane. The path is the
   * daemon-internal route (e.g. `/_decopilot_vm/read`); each runner is free
   * to translate (e.g. Docker prepends `/_daemon`, Freestyle base64-encodes
   * the body for Cloudflare WAF). Bearer/auth tokens stay inside the runner.
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
