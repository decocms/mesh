/**
 * Pure text templates for PR panel action buttons. Kept in a separate module
 * so they're trivially unit-testable and editable without touching the UI.
 *
 * All templates render into a natural-language user message that the LLM
 * executes via its GitHub tools.
 */

export interface TemplateContext {
  branch: string;
  base: string;
  prNumber?: number;
  failingChecks?: string[];
  checkName?: string;
}

export function createPr(
  ctx: Pick<TemplateContext, "branch" | "base">,
): string {
  return `Create a pull request for branch \`${ctx.branch}\` against \`${ctx.base}\`. Write a clear title and a summary of the changes so far.`;
}

export function mergeSquash(
  ctx: Pick<TemplateContext, "prNumber" | "base">,
): string {
  return `Squash-merge PR #${ctx.prNumber} into \`${ctx.base}\`.`;
}

export function mergeRebase(
  ctx: Pick<TemplateContext, "prNumber" | "base">,
): string {
  return `Rebase-merge PR #${ctx.prNumber} into \`${ctx.base}\`.`;
}

export function mergeCommit(
  ctx: Pick<TemplateContext, "prNumber" | "base">,
): string {
  return `Merge PR #${ctx.prNumber} into \`${ctx.base}\` with a merge commit.`;
}

export function rebaseOnBase(
  ctx: Pick<TemplateContext, "branch" | "base">,
): string {
  return `Rebase branch \`${ctx.branch}\` on the latest \`${ctx.base}\`.`;
}

export function resolveConflicts(
  ctx: Pick<TemplateContext, "branch" | "base">,
): string {
  return `Resolve the merge conflicts between \`${ctx.branch}\` and \`${ctx.base}\`.`;
}

export function fixErrors(
  ctx: Pick<TemplateContext, "prNumber" | "failingChecks">,
): string {
  const list = (ctx.failingChecks ?? []).join(", ");
  return `The following checks are failing on PR #${ctx.prNumber}: ${list}. Investigate and fix them.`;
}

export function rerunChecks(ctx: Pick<TemplateContext, "prNumber">): string {
  return `Re-run the failing checks on PR #${ctx.prNumber}.`;
}

export function rerunCheck(
  ctx: Pick<TemplateContext, "prNumber" | "checkName">,
): string {
  return `Re-run the \`${ctx.checkName}\` check on PR #${ctx.prNumber}.`;
}

export function closePr(ctx: Pick<TemplateContext, "prNumber">): string {
  return `Close PR #${ctx.prNumber} without merging.`;
}

export function reopenPr(ctx: Pick<TemplateContext, "prNumber">): string {
  return `Reopen PR #${ctx.prNumber}.`;
}
