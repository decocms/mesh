/**
 * Git API helpers
 *
 * Client-side git operations using SITE_BINDING tools (GIT_DIFF, GIT_COMMIT).
 * These are thin wrappers around toolCaller that handle errors gracefully.
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";

type ToolCaller = TypedToolCaller<SiteBinding>;

/**
 * Get the full unified diff of working-tree changes against HEAD.
 * Returns the raw diff string, or null if GIT_DIFF is not supported.
 */
export async function getDiff(
  toolCaller: ToolCaller,
  path?: string,
): Promise<string | null> {
  try {
    const result = await toolCaller("GIT_DIFF", { path });
    return result.diff;
  } catch {
    return null;
  }
}

/**
 * Stage all changes and create a git commit with the given message.
 * Returns { hash, message } on success, or null if GIT_COMMIT is not supported.
 */
export async function gitCommit(
  toolCaller: ToolCaller,
  message: string,
): Promise<{ hash: string; message: string } | null> {
  try {
    const result = await toolCaller("GIT_COMMIT", { message });
    return result;
  } catch {
    return null;
  }
}

/**
 * Generate a commit message via Claude Haiku (server-side).
 *
 * Calls POST /api/plugins/site-editor/commit-message with the diff text.
 * Returns the generated message string, or null on failure.
 * Failure is non-fatal — the caller should fall back to an empty textarea.
 */
export async function generateCommitMessage(
  diff: string,
): Promise<string | null> {
  try {
    const response = await fetch("/api/plugins/site-editor/commit-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diff }),
      credentials: "include",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { message?: string };
    return data.message ?? null;
  } catch {
    return null;
  }
}
