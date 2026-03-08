/**
 * Run State Machine Types
 *
 * Pure type definitions for the decopilot run lifecycle.
 * No imports from app code — safe to import anywhere.
 */

// ============================================================================
// Status
// ============================================================================

export type RunFailedReason = "cancelled" | "error" | "reaped" | "ghost";

export type RunStatus =
  | {
      tag: "running";
      abortController: AbortController;
      stepCount: number;
      startedAt: Date;
    }
  | { tag: "requires_action"; stepCount: number }
  | { tag: "completed"; stepCount: number };

export interface RunState {
  threadId: string;
  orgId: string;
  userId: string;
  status: RunStatus;
}

// ============================================================================
// Commands
// ============================================================================

export type RunCommand =
  | {
      type: "START";
      threadId: string;
      orgId: string;
      userId: string;
      /** Caller creates the AbortController so the decider stays truly pure */
      abortController: AbortController;
    }
  | { type: "STEP_DONE"; threadId: string }
  | {
      type: "FINISH";
      threadId: string;
      threadStatus: "completed" | "failed" | "requires_action";
    }
  | { type: "CANCEL"; threadId: string }
  | {
      type: "FORCE_FAIL";
      threadId: string;
      reason: "ghost" | "reaped";
      /** Required when reason is "ghost" — no in-memory state to derive orgId from */
      orgId?: string;
    };

// ============================================================================
// Events
// ============================================================================

export type RunEvent =
  | {
      type: "RUN_STARTED";
      threadId: string;
      orgId: string;
      userId: string;
      abortController: AbortController;
    }
  | { type: "STEP_COMPLETED"; threadId: string; stepCount: number }
  /** orgId carried on event because post-projection state is undefined */
  | {
      type: "RUN_COMPLETED";
      threadId: string;
      orgId: string;
      stepCount: number;
    }
  /** orgId carried on event because post-projection state is undefined */
  | {
      type: "RUN_REQUIRES_ACTION";
      threadId: string;
      orgId: string;
      stepCount: number;
    }
  /** orgId carried on event because post-projection state is undefined */
  | {
      type: "RUN_FAILED";
      threadId: string;
      orgId: string;
      reason: RunFailedReason;
    }
  /** orgId carried on event because post-projection state is undefined */
  | { type: "PREVIOUS_RUN_ABORTED"; threadId: string; orgId: string };

export type RunEventPair = { event: RunEvent; state: RunState | undefined };
