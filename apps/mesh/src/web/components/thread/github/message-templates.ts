/**
 * Pure text templates for PR panel action buttons. Kept in a separate module
 * so they're trivially unit-testable and editable without touching the UI.
 *
 * The agent's system prompt (buildRepoEnvironmentPrompt) already carries:
 * - Which repo/branch is active (owner/name in prompt, branch from VM cwd)
 * - The git-CLI-vs-GitHub-tools split
 * - The "button click is authenticated intent — don't ask, just execute"
 *   override of the default <safety> rule
 *
 * So these templates are intentionally terse: imperative verbs, no env
 * boilerplate, no "please consider" hedging.
 */

export interface TemplateContext {
  failingChecks?: string[];
  checkName?: string;
}

export function commitAndPush(): string {
  return `Commit every pending change in the working tree with a concise conventional-commit message summarizing the diff, then push. If local commits are ahead of the remote, push those in the same invocation.`;
}

export function createPr(): string {
  return `Open a pull request for the current branch against its base. Write a clear title and a summary of the changes so far.`;
}

export function reopenPr(): string {
  return `Reopen the pull request.`;
}

export function rebaseOnBase(): string {
  return `Rebase the current branch on the latest base and force-push with --force-with-lease.`;
}

export function rerunCheck(ctx: Pick<TemplateContext, "checkName">): string {
  return `Re-run the \`${ctx.checkName}\` check. If an empty commit is needed to retrigger CI, create and push one.`;
}

export function fixChecks(ctx: Pick<TemplateContext, "failingChecks">): string {
  const list = (ctx.failingChecks ?? []).map((n) => `\`${n}\``).join(", ");
  return `Failing checks: ${list}. For each: read the logs, diagnose the root cause, apply the smallest fix that makes it pass, commit, and push.`;
}

export function markReadyForReview(): string {
  return `Mark the pull request ready for review.`;
}

export function resolveReviewComments(): string {
  return `Read the unresolved review threads on the pull request. For each thread: understand the reviewer's ask, apply the needed changes, commit, push, reply explaining what changed, and resolve the thread. If a comment is a question that doesn't need a code change, reply with the answer and resolve.`;
}

export function reviewPr(): string {
  return `Review the pull request. Read the full diff, analyze every changed file for correctness, security, code quality, and alignment with the repo's patterns. Post specific line-level review comments on concerns, then submit an overall review (approve / request changes / comment) with a concise summary. Do not modify the code — this is a read-and-comment pass.`;
}

export function mergeSquash(): string {
  return `Squash-merge the pull request into its base.`;
}
