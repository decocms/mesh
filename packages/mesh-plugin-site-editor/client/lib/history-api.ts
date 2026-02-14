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
