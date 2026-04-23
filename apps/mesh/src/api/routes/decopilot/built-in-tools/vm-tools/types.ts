/**
 * Shared types for the VM tool factory. The factory builds the same six
 * LLM-visible tools (read/write/edit/grep/glob/bash) regardless of which
 * runner backs the sandbox; transport differences live inside the runner's
 * `proxyDaemonRequest`.
 */

import type { SandboxRunner } from "mesh-plugin-user-sandbox/runner";

export interface VmToolsParams {
  /** The active sandbox runner (Docker / Freestyle / Kubernetes). */
  readonly runner: SandboxRunner;
  /**
   * Lazy handle resolver. Invoked on every tool call; expected to be
   * idempotent and memoised by the caller so the first invocation
   * provisions the container (and any repo clone / env / prep-image
   * resolution) and subsequent calls hand back the cached handle.
   */
  readonly ensureHandle: () => Promise<string>;
  readonly toolOutputMap: Map<string, string>;
  /**
   * Approval gate for mutating tools (write/edit/bash). Read-only tools
   * (read/grep/glob) bypass this.
   */
  readonly needsApproval: boolean;
}
