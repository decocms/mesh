/**
 * History API helpers
 *
 * Client-side file history operations using SITE_BINDING tools
 * (GET_FILE_HISTORY, READ_FILE_AT). Revert is implemented as a
 * read-old-content + write-as-new-version pattern using PUT_FILE.
 * All functions gracefully degrade if history tools are not supported.
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";

type ToolCaller = TypedToolCaller<SiteBinding>;

export interface HistoryEntry {
  commitHash: string;
  timestamp: number;
  author: string;
  message: string;
}

const PAGES_PREFIX = ".deco/pages/";

/**
 * Get the commit history for a file.
 * Returns null if history tools are not supported.
 */
export async function getFileHistory(
  toolCaller: ToolCaller,
  path: string,
  opts?: { branch?: string; limit?: number },
): Promise<HistoryEntry[] | null> {
  try {
    const result = await toolCaller("GET_FILE_HISTORY", {
      path,
      branch: opts?.branch,
      limit: opts?.limit,
    });
    return result.entries;
  } catch {
    return null;
  }
}

/**
 * Read a file's content at a specific commit.
 * Returns null if history tools are not supported.
 */
export async function readFileAt(
  toolCaller: ToolCaller,
  path: string,
  commitHash: string,
): Promise<string | null> {
  try {
    const result = await toolCaller("READ_FILE_AT", { path, commitHash });
    return result.content;
  } catch {
    return null;
  }
}

export interface GitLogEntry {
  hash: string; // full commit hash from GIT_LOG output schema
  author: string;
  date: string; // ISO date string
  message: string;
}

const GIT_BASE = "/api/plugins/site-editor/git";

/**
 * Get commit history for a file using server-side git route.
 * Returns null on failure.
 */
export async function getGitLog(
  connectionId: string,
  path: string,
  limit = 50,
): Promise<GitLogEntry[] | null> {
  try {
    const params = new URLSearchParams({
      connectionId,
      path,
      limit: String(limit),
    });
    const res = await fetch(`${GIT_BASE}/log?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { commits?: GitLogEntry[] };
    return data.commits ?? null;
  } catch {
    return null;
  }
}

/**
 * Read file content at a specific commit using server-side git route.
 * Returns null on failure.
 */
export async function getGitShow(
  connectionId: string,
  path: string,
  commitHash: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ connectionId, path, commitHash });
    const res = await fetch(`${GIT_BASE}/show?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string };
    return data.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Revert a page to a previous commit.
 *
 * Steps:
 * 1. Read content at commitHash via server git/show route
 * 2. Write it to disk via PUT_FILE (toolCaller — still works with any MCP)
 * 3. Commit the change via server git/commit route
 */
export async function revertToCommit(
  toolCaller: ToolCaller,
  connectionId: string,
  pageId: string,
  commitHash: string,
): Promise<{ success: boolean; committedWithGit: boolean }> {
  const path = `${PAGES_PREFIX}${pageId}.json`;
  const shortHash = commitHash.slice(0, 7);

  // 1. Read historical content via server route
  const content = await getGitShow(connectionId, path, commitHash);
  if (!content) return { success: false, committedWithGit: false };

  // 2. Write to disk via PUT_FILE (works with @modelcontextprotocol/server-filesystem)
  try {
    await toolCaller("PUT_FILE", { path, content });
  } catch {
    return { success: false, committedWithGit: false };
  }

  // 3. Commit via server route
  let committedWithGit = false;
  try {
    const res = await fetch(`${GIT_BASE}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId,
        message: `revert: restore page to ${shortHash}`,
      }),
    });
    committedWithGit = res.ok;
  } catch {
    // Commit failed — write still succeeded
  }

  return { success: true, committedWithGit };
}

/**
 * Revert a page to a previous version.
 *
 * Implements the "revert as PUT_FILE" pattern:
 * 1. Read old content at the given commit hash
 * 2. Parse JSON, update metadata.updatedAt to now
 * 3. Write as new version via PUT_FILE
 *
 * This is non-destructive: old versions are preserved and revert
 * creates a new commit.
 */
export async function revertPage(
  toolCaller: ToolCaller,
  pageId: string,
  commitHash: string,
): Promise<boolean> {
  try {
    const path = `${PAGES_PREFIX}${pageId}.json`;

    // 1. Read old content
    const oldContent = await readFileAt(toolCaller, path, commitHash);
    if (!oldContent) return false;

    // 2. Parse and update timestamp
    const page = JSON.parse(oldContent);
    page.metadata = {
      ...page.metadata,
      updatedAt: new Date().toISOString(),
    };

    // 3. Write as new version
    await toolCaller("PUT_FILE", {
      path,
      content: JSON.stringify(page, null, 2),
    });

    return true;
  } catch {
    return false;
  }
}
