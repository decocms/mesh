/**
 * Public lifecycle types for SandboxClaim phase reporting.
 *
 * Lives in its own module (rather than co-located with the watcher) so that
 * type-only consumers — notably the studio web bundle — can import them
 * without dragging `@kubernetes/client-node` through the dependency graph.
 * `import type` already erases at build time, but a dedicated types file
 * makes the boundary explicit and tool-friendly.
 */

export type ClaimFailureReason =
  | "image-pull-backoff"
  | "crash-loop-backoff"
  | "scheduling-timeout"
  | "claim-never-created"
  | "reconciler-error"
  | "unknown";

export type ClaimPhase =
  | { kind: "claiming"; since: number }
  | {
      kind: "waiting-for-capacity";
      since: number;
      message?: string;
      /** Karpenter-emitted nodeclaim name when a node is being provisioning. */
      nodeClaim?: string;
    }
  | { kind: "pulling-image"; since: number }
  | { kind: "starting-container"; since: number }
  | { kind: "warming-daemon"; since: number }
  | { kind: "ready" }
  | { kind: "failed"; reason: ClaimFailureReason; message: string };
