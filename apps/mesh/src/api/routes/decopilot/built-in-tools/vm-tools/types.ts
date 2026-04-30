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
  /**
   * Current chat thread id. When set, prepended as `THREAD_ID=...` to
   * every `bash` invocation so skills running inside the sandbox
   * (notably `user-data-share`) can attribute artifacts to the active
   * turn — sandboxes are per-(user, agent), not per-thread, so the
   * thread isn't deducible from the sandbox identity alone.
   */
  readonly threadId?: string | null;
}
