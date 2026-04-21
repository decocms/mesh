/**
 * Pure text templates for PR panel action buttons. Kept in a separate module
 * so they're trivially unit-testable and editable without touching the UI.
 *
 * All templates render into a natural-language user message that the LLM
 * executes via its GitHub tools.
 */

export interface TemplateContext {
  owner: string;
  repo: string;
  branch: string;
  base: string;
  prNumber?: number;
  failingChecks?: string[];
  checkName?: string;
}

type RepoCtx = Pick<TemplateContext, "owner" | "repo">;
const repoRef = (c: RepoCtx) => `${c.owner}/${c.repo}`;

export function createPr(
  ctx: Pick<TemplateContext, "owner" | "repo" | "branch" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, create a pull request for branch \`${ctx.branch}\` against \`${ctx.base}\`. Write a clear title and a summary of the changes so far.`;
}

export function mergeSquash(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, squash-merge PR #${ctx.prNumber} into \`${ctx.base}\`.`;
}

export function mergeRebase(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, rebase-merge PR #${ctx.prNumber} into \`${ctx.base}\`.`;
}

export function mergeCommit(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, merge PR #${ctx.prNumber} into \`${ctx.base}\` with a merge commit.`;
}

export function rebaseOnBase(
  ctx: Pick<TemplateContext, "owner" | "repo" | "branch" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, rebase branch \`${ctx.branch}\` on the latest \`${ctx.base}\`.`;
}

export function resolveConflicts(
  ctx: Pick<TemplateContext, "owner" | "repo" | "branch" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, resolve the merge conflicts between \`${ctx.branch}\` and \`${ctx.base}\`.`;
}

export function fixErrors(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "failingChecks">,
): string {
  const list = (ctx.failingChecks ?? []).join(", ");
  return `On repo \`${repoRef(ctx)}\`, the following checks are failing on PR #${ctx.prNumber}: ${list}. Investigate and fix them.`;
}

export function rerunChecks(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, re-run the failing checks on PR #${ctx.prNumber}.`;
}

export function rerunCheck(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "checkName">,
): string {
  return `On repo \`${repoRef(ctx)}\`, re-run the \`${ctx.checkName}\` check on PR #${ctx.prNumber}.`;
}

export function closePr(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, close PR #${ctx.prNumber} without merging.`;
}

export function reopenPr(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, reopen PR #${ctx.prNumber}.`;
}
