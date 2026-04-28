import type { SandboxRunner } from "@decocms/sandbox/runner";
import type { PendingImage } from "../take-screenshot";

export interface VmToolsParams {
  readonly runner: SandboxRunner;
  /**
   * Lazy handle resolver. Invoked on every tool call; caller is expected
   * to memoise so the first invocation provisions and later calls reuse.
   */
  readonly ensureHandle: () => Promise<string>;
  readonly toolOutputMap: Map<string, string>;
  readonly needsApproval: boolean;
  /**
   * Shared queue for vision inputs that should be injected into the next
   * model turn. The `read` tool pushes here when it loads an image; the
   * queue is flushed by `prepareStep` in stream-core.ts.
   */
  readonly pendingImages: PendingImage[];
}
