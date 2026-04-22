import type { BranchStatus } from "@/web/components/vm/hooks/use-vm-events";
import type { CheckRun, PrSummary } from "./use-pr-data.ts";
import type { PrReviewSignals } from "./use-pr-reviews.ts";

/**
 * Descriptor returned by selectHeaderButton. Callers translate action →
 * prompt via the message-templates module. `disabled: true` means the
 * button renders as a status indicator (e.g., "Waiting for checks"), not
 * clickable.
 */
export type HeaderButton = {
  label: string;
  action?:
    | "commit-and-push"
    | "create-pr"
    | "reopen"
    | "rebase"
    | "fix-checks"
    | "mark-ready"
    | "resolve-comments"
    | "merge-split";
  disabled?: boolean;
  meta?: {
    failingChecks?: string[];
  };
};

type FailedConclusion =
  | "failure"
  | "timed_out"
  | "cancelled"
  | "action_required";

const FAILED_CONCLUSIONS = new Set<FailedConclusion>([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
]);

function isCheckFailed(c: CheckRun): boolean {
  return (
    c.status === "completed" &&
    FAILED_CONCLUSIONS.has(c.conclusion as FailedConclusion)
  );
}

function isCheckInProgress(c: CheckRun): boolean {
  return c.status === "queued" || c.status === "in_progress";
}

export function selectHeaderButton(input: {
  branchStatus: BranchStatus | null;
  pr: PrSummary | null;
  checks: CheckRun[];
  reviews: PrReviewSignals | null;
}): HeaderButton | null {
  const { branchStatus, pr, checks, reviews } = input;

  if (!branchStatus) return null;

  const hasLocalWork =
    branchStatus.workingTreeDirty || branchStatus.unpushed > 0;
  if (hasLocalWork) {
    return { label: "Commit & Push", action: "commit-and-push" };
  }

  if (branchStatus.aheadOfBase > 0) {
    if (pr && pr.state === "closed" && !pr.merged) {
      return { label: "Reopen PR", action: "reopen" };
    }
    if (!pr || pr.merged) {
      return { label: "Create PR", action: "create-pr" };
    }

    // pr.state === "open"
    const mergeableState = reviews?.mergeableState ?? "unknown";

    if (mergeableState === "dirty") {
      return { label: `Rebase on ${pr.base}`, action: "rebase" };
    }

    const failing = checks.filter(isCheckFailed).map((c) => c.name);
    if (failing.length > 0) {
      return {
        label: "Fix checks",
        action: "fix-checks",
        meta: { failingChecks: failing },
      };
    }

    if (checks.some(isCheckInProgress)) {
      return { label: "Waiting for checks", disabled: true };
    }

    if (reviews?.draft) {
      return { label: "Mark ready for review", action: "mark-ready" };
    }

    if ((reviews?.unresolvedConversations ?? 0) > 0) {
      return {
        label: "Resolve review comments",
        action: "resolve-comments",
      };
    }

    if (reviews?.missingRequiredApprovals) {
      return { label: "Waiting for review", disabled: true };
    }

    return { label: "Merge", action: "merge-split" };
  }

  return null;
}

/** @deprecated — kept temporarily for header-actions.tsx until Task 7. */
export type PanelState =
  | { kind: "no-branch" }
  | { kind: "no-pr" }
  | { kind: "open"; pr: PrSummary }
  | { kind: "closed"; pr: PrSummary };

/** @deprecated — kept temporarily for header-actions.tsx until Task 7. */
export function derivePanelState(
  branch: string | null | undefined,
  pr: PrSummary | null | undefined,
): PanelState {
  if (!branch) return { kind: "no-branch" };
  if (!pr) return { kind: "no-pr" };
  if (pr.state === "closed") return { kind: "closed", pr };
  return { kind: "open", pr };
}
