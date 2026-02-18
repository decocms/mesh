/**
 * Git API helpers
 *
 * Client-side git operations via server routes at /api/plugins/site-editor/git/*
 * Works regardless of which MCP server the user connected.
 */

const GIT_BASE = "/api/plugins/site-editor/git";

/**
 * Get the full unified diff of working-tree changes against HEAD.
 * Returns the raw diff string, or null on failure.
 */
export async function getDiff(
  connectionId: string,
  path?: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ connectionId });
    if (path) params.set("path", path);
    const res = await fetch(`${GIT_BASE}/diff?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { diff?: string };
    return data.diff ?? null;
  } catch {
    return null;
  }
}

/**
 * Stage all changes and create a git commit with the given message.
 * Returns { hash, message } on success, or null on failure.
 */
export async function gitCommit(
  connectionId: string,
  message: string,
): Promise<{ hash: string; message: string } | null> {
  try {
    const res = await fetch(`${GIT_BASE}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, message }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { hash: string; message: string };
  } catch {
    return null;
  }
}

/**
 * Generate a commit message via Claude Haiku (server-side).
 * Returns the generated message string, or null on failure.
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
