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

/**
 * Preamble appended to any command that involves rewriting history or
 * resolving conflicts. Tells the agent to use the BASH tool + git CLI
 * directly (not the github-mcp-server API, which e.g. performs a merge
 * instead of a true rebase).
 */
const GIT_CLI_PREAMBLE =
  "Use the BASH tool with the git CLI inside the vm's working tree (not the GitHub REST/MCP tools) for any step that rewrites history, resolves conflicts, stages/commits, or pushes — the repo is already cloned and checked out there. Reserve the GitHub tools for PR-level operations (opening/closing/merging PRs, posting review comments).";

export function createPr(
  ctx: Pick<TemplateContext, "owner" | "repo" | "branch" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, create a pull request for branch \`${ctx.branch}\` against \`${ctx.base}\`. Write a clear title and a summary of the changes so far. ${GIT_CLI_PREAMBLE}`;
}

export function mergeSquash(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, squash-merge PR #${ctx.prNumber} into \`${ctx.base}\`. You may call the GitHub merge API for this since it's a PR-level operation; use the BASH tool with git only if you need to prep or reorganize commits first.`;
}

export function rebaseOnBase(
  ctx: Pick<TemplateContext, "owner" | "repo" | "branch" | "base">,
): string {
  return `On repo \`${repoRef(ctx)}\`, rebase branch \`${ctx.branch}\` on the latest \`${ctx.base}\` using the BASH tool and git CLI in the vm's working tree. Run \`git fetch origin\`, \`git checkout ${ctx.branch}\`, \`git rebase origin/${ctx.base}\`, then \`git push --force-with-lease\`. Do NOT use the GitHub \`update_pull_request_branch\` MCP tool — it performs a merge-of-base, not a true rebase. ${GIT_CLI_PREAMBLE}`;
}

export function rerunCheck(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "checkName">,
): string {
  return `On repo \`${repoRef(ctx)}\`, re-run the \`${ctx.checkName}\` check on PR #${ctx.prNumber} via the GitHub MCP tools. If an empty commit is needed to retrigger CI, use the BASH tool with git to create and push it.`;
}

export function commitAndPush(
  ctx: Pick<TemplateContext, "owner" | "repo" | "branch">,
): string {
  return `On repo \`${repoRef(ctx)}\`, commit every pending change in the vm's working tree with a concise conventional-commit message summarizing the diff, then push to \`origin/${ctx.branch}\`. If there are already-committed changes ahead of the remote, push those in the same invocation. ${GIT_CLI_PREAMBLE}`;
}

export function fixChecks(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber" | "failingChecks">,
): string {
  const list = (ctx.failingChecks ?? []).map((n) => `\`${n}\``).join(", ");
  return `On repo \`${repoRef(ctx)}\`, PR #${ctx.prNumber} has the following failing checks: ${list}. For each: read the check's logs via the GitHub MCP tools, diagnose the root cause, apply the smallest fix that makes the check pass in the vm's working tree, commit, and push. ${GIT_CLI_PREAMBLE}`;
}

export function markReadyForReview(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, mark PR #${ctx.prNumber} as ready for review. Use the GitHub MCP tools for this PR-level operation.`;
}

export function resolveReviewComments(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, read the unresolved review threads on PR #${ctx.prNumber} via the GitHub MCP tools. For each thread: understand the reviewer's ask, make the needed changes in the vm's working tree, commit, push, post a reply explaining what changed, and mark the thread resolved. If a comment is a question that doesn't need a code change, reply with the answer and resolve. ${GIT_CLI_PREAMBLE}`;
}

export function reviewPr(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, review PR #${ctx.prNumber}. Read the full diff via the GitHub MCP tools, then analyze every changed file for correctness, security, code quality, and alignment with the repo's existing patterns. Post specific line-level review comments where you have concerns, then submit an overall review (approve / request changes / comment) with a concise summary. Do not modify the code — this is a read-and-comment pass.`;
}

export function reopenPr(
  ctx: Pick<TemplateContext, "owner" | "repo" | "prNumber">,
): string {
  return `On repo \`${repoRef(ctx)}\`, reopen PR #${ctx.prNumber}. Use the GitHub MCP tools for this PR-level operation.`;
}
