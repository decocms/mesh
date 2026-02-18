/**
 * Pending Changes API helpers
 *
 * Client-side git working-tree helpers for the page composer.
 * Calls GIT_STATUS, GIT_SHOW, and GIT_CHECKOUT via SITE_BINDING tools.
 * All functions gracefully degrade — returning null / false if the tool
 * throws (not supported, file untracked, network error, etc.).
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";
import type { BlockInstance } from "./page-api";

type ToolCaller = TypedToolCaller<SiteBinding>;

export interface FileStatus {
  path: string;
  staged: "modified" | "added" | "deleted" | "untracked" | "renamed" | null;
  unstaged: "modified" | "added" | "deleted" | "untracked" | "renamed" | null;
}

/**
 * Get the git working-tree status for a single file.
 * Returns null if the tool throws (not supported or file not tracked).
 */
export async function getGitStatus(
  toolCaller: ToolCaller,
  filePath: string,
): Promise<FileStatus | null> {
  try {
    const result = await toolCaller("GIT_STATUS", { path: filePath });
    return result.files.find((f) => f.path === filePath) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the committed (HEAD) blocks array for a page file.
 * Calls GIT_SHOW and parses the JSON, returning the blocks array.
 * Returns null if the tool throws or the file is untracked / not a page JSON.
 */
export async function getCommittedPage(
  toolCaller: ToolCaller,
  filePath: string,
): Promise<BlockInstance[] | null> {
  try {
    const result = await toolCaller("GIT_SHOW", {
      path: filePath,
      commitHash: "HEAD",
    });
    const page = JSON.parse(result.content);
    return Array.isArray(page.blocks) ? page.blocks : null;
  } catch {
    return null;
  }
}

/**
 * Discard all uncommitted changes to a page file via GIT_CHECKOUT.
 * Returns true on success, false if the tool throws.
 */
export async function discardPageChanges(
  toolCaller: ToolCaller,
  filePath: string,
): Promise<boolean> {
  try {
    await toolCaller("GIT_CHECKOUT", { path: filePath, force: true });
    return true;
  } catch {
    return false;
  }
}
