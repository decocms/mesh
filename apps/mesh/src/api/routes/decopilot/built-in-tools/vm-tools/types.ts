import type { SandboxRunner } from "@decocms/sandbox/runner";

export interface VmToolsParams {
  readonly runner: SandboxRunner;
  /**
   * Lazy handle resolver. Invoked on every tool call; caller is expected
   * to memoise so the first invocation provisions and later calls reuse.
   */
  readonly ensureHandle: () => Promise<string>;
  readonly toolOutputMap: Map<string, string>;
  readonly needsApproval: boolean;
}
