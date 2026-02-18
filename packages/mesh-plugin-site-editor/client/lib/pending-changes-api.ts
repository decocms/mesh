/**
 * Pending Changes API helpers
 *
 * Client-side git working-tree helpers for the page composer.
 * Calls the site-editor server routes at /api/plugins/site-editor/git/*
 * so they work regardless of which MCP server the user connected.
 */

import type { BlockInstance } from "./page-api";

const GIT_BASE = "/api/plugins/site-editor/git";

export interface FileStatus {
  path: string;
  staged: "modified" | "added" | "deleted" | "untracked" | "renamed" | null;
  unstaged: "modified" | "added" | "deleted" | "untracked" | "renamed" | null;
}

/**
 * Get the git working-tree status for a single file.
 * Returns null if the server route fails.
 */
export async function getGitStatus(
  connectionId: string,
  filePath: string,
): Promise<FileStatus | null> {
  try {
    const params = new URLSearchParams({ connectionId, path: filePath });
    const res = await fetch(`${GIT_BASE}/status?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { files?: FileStatus[] };
    return data.files?.find((f) => f.path === filePath) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the committed (HEAD) blocks array for a page file.
 * Returns null if the file is untracked or the route fails.
 */
export async function getCommittedPage(
  connectionId: string,
  filePath: string,
): Promise<BlockInstance[] | null> {
  try {
    const params = new URLSearchParams({
      connectionId,
      path: filePath,
      commitHash: "HEAD",
    });
    const res = await fetch(`${GIT_BASE}/show?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string };
    if (!data.content) return null;
    const page = JSON.parse(data.content) as { blocks?: BlockInstance[] };
    return Array.isArray(page.blocks) ? page.blocks : null;
  } catch {
    return null;
  }
}

/**
 * Discard all uncommitted changes to a page file via GIT_CHECKOUT.
 * Returns true on success.
 */
export async function discardPageChanges(
  connectionId: string,
  filePath: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${GIT_BASE}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, path: filePath, force: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
