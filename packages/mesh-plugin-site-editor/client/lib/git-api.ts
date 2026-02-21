import type { GenericToolCaller } from "./page-api";

export interface GitCommit {
  hash: string;
  author: string;
  date: string; // ISO 8601
  message: string;
}

export type GitFileStatus = "M" | "A" | "D" | "?" | "clean";

export interface GitStatusResult {
  status: GitFileStatus;
  rawLine: string;
}

/**
 * Check if the connection exposes a bash tool.
 * Git UX is hidden when bash is not available (non-local-dev connections).
 */
export function hasBashTool(
  tools: Array<{ name: string }> | null | undefined,
): boolean {
  return (tools ?? []).some((t) => t.name === "bash");
}

/**
 * Get git status for a specific page file.
 * Returns "clean" if file has no changes, otherwise the git porcelain status code.
 */
export async function gitStatus(
  toolCaller: GenericToolCaller,
  pageId: string,
): Promise<GitStatusResult> {
  const result = (await toolCaller("bash", {
    command: `git status --porcelain .deco/pages/${pageId}.json`,
  })) as { stdout: string; stderr: string; exitCode: number };

  const line = result.stdout.trim();
  if (!line) return { status: "clean", rawLine: "" };

  // git porcelain: "XY filename" — first two chars are status codes
  const code = line.slice(0, 2).trim();
  const status: GitFileStatus =
    code === "M" || code === "MM"
      ? "M"
      : code === "A" || code === "AM"
        ? "A"
        : code === "D"
          ? "D"
          : code === "??"
            ? "?"
            : "M"; // fallback: treat as modified
  return { status, rawLine: line };
}

/**
 * Get git commit history for a specific page file.
 * Returns empty array if git is not initialized or file has no history.
 */
export async function gitLog(
  toolCaller: GenericToolCaller,
  pageId: string,
): Promise<GitCommit[]> {
  const result = (await toolCaller("bash", {
    command: `git log --format="%H|%an|%aI|%s" -- .deco/pages/${pageId}.json`,
  })) as { stdout: string; exitCode: number };

  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...messageParts] = line.split("|");
      return {
        hash: hash ?? "",
        author: author ?? "",
        date: date ?? "",
        message: messageParts.join("|"),
      };
    });
}

/**
 * Get the content of a page file at a specific commit.
 */
export async function gitShow(
  toolCaller: GenericToolCaller,
  hash: string,
  pageId: string,
): Promise<string> {
  const result = (await toolCaller("bash", {
    command: `git show ${hash}:.deco/pages/${pageId}.json`,
  })) as { stdout: string; exitCode: number };
  return result.stdout;
}

/**
 * Revert a page file to a specific commit (file-level revert).
 */
export async function gitCheckout(
  toolCaller: GenericToolCaller,
  hash: string,
  pageId: string,
): Promise<void> {
  await toolCaller("bash", {
    command: `git checkout ${hash} -- .deco/pages/${pageId}.json`,
  });
}

/**
 * Stage all changes and commit with the given message.
 * Escapes double quotes in message to prevent shell injection.
 */
export async function gitCommit(
  toolCaller: GenericToolCaller,
  message: string,
): Promise<void> {
  const safeMessage = message.replace(/"/g, '\\"').replace(/`/g, "\\`");
  await toolCaller("bash", {
    command: `git add -A && git commit -m "${safeMessage}"`,
  });
}
