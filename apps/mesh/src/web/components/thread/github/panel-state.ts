import type { BranchStatus } from "@/web/components/vm/hooks/use-vm-events";
import type { CheckRun, PrSummary } from "./use-pr-data.ts";
import type { PrReviewSignals } from "./use-pr-reviews.ts";

/**
 * Descriptor returned by selectHeaderButton. Callers translate action →
 * prompt via the message-templates module. `disabled: true` means the
 * button renders as a status indicator (e.g., "Running tests…"), not
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
    return { label: "Save changes", action: "commit-and-push" };
  }

  if (branchStatus.aheadOfBase > 0) {
    if (pr && pr.state === "closed" && !pr.merged) {
      return { label: "Reopen", action: "reopen" };
    }
    if (!pr || pr.merged) {
      return { label: "Submit for review", action: "create-pr" };
    }

    // pr.state === "open"
    const mergeableState = reviews?.mergeableState ?? "unknown";

    if (mergeableState === "dirty") {
      return { label: `Sync with ${pr.base}`, action: "rebase" };
    }

    const failing = checks.filter(isCheckFailed).map((c) => c.name);
    if (failing.length > 0) {
      return {
        label: "Fix tests",
        action: "fix-checks",
        meta: { failingChecks: failing },
      };
    }

    if (checks.some(isCheckInProgress)) {
      return { label: "Running tests…", disabled: true };
    }

    if (reviews?.draft) {
      return { label: "Mark ready", action: "mark-ready" };
    }

    if ((reviews?.unresolvedConversations ?? 0) > 0) {
      return {
        label: "Address feedback",
        action: "resolve-comments",
      };
    }

    if (reviews?.missingRequiredApprovals) {
      return { label: "Awaiting review", disabled: true };
    }

    return { label: "Publish", action: "merge-split" };
  }

  return null;
}
