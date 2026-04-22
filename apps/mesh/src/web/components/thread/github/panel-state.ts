import type { PrSummary } from "./use-pr-data.ts";

/**
 * The panel state the UI derives from the branch / PR data.
 *
 * - "no-branch": the thread has no branch attached (not github-linked,
 *   or legacy thread predating M1).
 * - "no-pr": the thread has a branch but there's no PR for it yet.
 * - "open": a PR is open. (This plan treats "open" as a single bucket;
 *   follow-up work can add `behind`, `conflicts`, `checks-failing` variants
 *   when the underlying data hooks exist.)
 * - "closed": the PR was merged or closed.
 */
export type PanelState =
  | { kind: "no-branch" }
  | { kind: "no-pr" }
  | { kind: "open"; pr: PrSummary }
  | { kind: "closed"; pr: PrSummary };

export function derivePanelState(
  branch: string | null | undefined,
  pr: PrSummary | null | undefined,
): PanelState {
  if (!branch) return { kind: "no-branch" };
  if (!pr) return { kind: "no-pr" };
  if (pr.state === "closed") return { kind: "closed", pr };
  return { kind: "open", pr };
}
