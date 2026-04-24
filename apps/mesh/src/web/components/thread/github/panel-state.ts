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

  // Merged PR is terminal UNLESS the branch has advanced past the PR's
  // head (i.e. new commits were pushed after the merge). Squash-merges
  // leave the branch's pre-merge commits intact on origin/<branch> with
  // their original SHAs, so aheadOfBase alone can't distinguish
  // "work shipped, nothing new" from "new work since the merge". Compare
  // the branch's HEAD sha to the PR's head sha to decide.
  if (pr?.merged) {
    const branchAdvanced =
      !!branchStatus.headSha &&
      !!pr.headSha &&
      branchStatus.headSha !== pr.headSha;
    if (branchAdvanced) {
      return { label: "Submit for review", action: "create-pr" };
    }
    return null;
  }

  if (branchStatus.aheadOfBase > 0) {
    if (pr && pr.state === "closed" && !pr.merged) {
      return { label: "Reopen", action: "reopen" };
    }
    if (!pr) {
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
