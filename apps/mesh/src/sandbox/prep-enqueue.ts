/**
 * Prep Enqueue Helper
 *
 * Turns a Virtual MCP `githubRepo` link into an enqueued `sandbox_prep` row
 * so the prep worker can bake an image in the background. Fire-and-forget —
 * callers don't block repo-link responses on bake scheduling.
 *
 * Skipped entirely when the Docker runner isn't selected, since the prep
 * image only applies to that code path.
 */

import type { MeshContext } from "@/core/mesh-context";
import { fetchRemoteHeadSha } from "./prep-head-check";

export interface GithubRepoRef {
  owner: string;
  name: string;
  connectionId: string;
}

/**
 * Same-repo comparison. Prep images are keyed off the canonical GitHub URL
 * which is derived from (owner, name) — so a connection-id rotation against
 * the same repo isn't a new bake, it's just a token refresh.
 */
export function isSameRepo(
  a: GithubRepoRef | null | undefined,
  b: GithubRepoRef | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.owner === b.owner && a.name === b.name;
}

export function enqueuePrepForRepoLink(
  ctx: MeshContext,
  userId: string,
  repo: GithubRepoRef,
): void {
  if (process.env.MESH_SANDBOX_RUNNER !== "docker") return;
  const cloneUrl = canonicalGithubCloneUrl(repo.owner, repo.name);
  void ctx.storage.sandboxPrep
    .enqueue({
      userId,
      cloneUrl,
      repoOwner: repo.owner,
      repoName: repo.name,
      connectionId: repo.connectionId,
    })
    .catch((err) => {
      console.error(
        "[prep] failed to enqueue bake for repo link:",
        err instanceof Error ? err.message : err,
      );
    });
}

function canonicalGithubCloneUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}

/**
 * Look up a ready prep image for this (user, repo). Returns the image tag
 * callers should pass to `ensureSandbox({ image })`, or `null` when no baked
 * image is available (first thread, bake still running, or bake failed).
 *
 * Touches `last_used_at` as a side-effect so LRU eviction sees the row as
 * active. Fire-and-forget — we don't want the bash tool to stall on a
 * bookkeeping write.
 *
 * Backfill on miss: when no row exists for this (user, repo), enqueue a
 * pending bake so the *next* thread for this repo rides the cache. The
 * current thread still pays the slow path (the bake hasn't finished yet),
 * but without this, repos linked before the prep system existed would
 * never self-heal.
 *
 * Freshness check: for `ready` rows we also peek at the remote default
 * branch's HEAD SHA. If it drifted from the SHA we baked, we re-enqueue
 * and take the slow path so the current thread runs against current code
 * instead of a stale snapshot. The check is throttled in-process
 * (`prep-head-check.ts`) so the common case adds near-zero latency, and
 * it fails open — network errors never invalidate a working image.
 */
export async function resolvePrepImage(
  ctx: MeshContext,
  userId: string,
  repo: GithubRepoRef,
): Promise<string | null> {
  if (process.env.MESH_SANDBOX_RUNNER !== "docker") return null;
  const cloneUrl = canonicalGithubCloneUrl(repo.owner, repo.name);
  const row = await ctx.storage.sandboxPrep.findByUserClone(userId, cloneUrl);
  // Missing OR failed/stale → enqueue a bake. `enqueue()` is idempotent and
  // flips terminal rows back to `pending`; leaves `pending`/`baking` alone.
  // Without the failed branch, a bad bake poisons the row forever and every
  // future thread cold-starts.
  if (!row || row.status === "failed" || row.status === "stale") {
    enqueuePrepForRepoLink(ctx, userId, repo);
    return null;
  }
  if (row.status !== "ready" || !row.imageTag) return null;

  // Remote-drift revalidation. Only when we actually captured a SHA at
  // bake time — a `ready` row without `headSha` came from a non-git
  // workdir, nothing to compare against.
  if (row.headSha) {
    const remoteSha = await fetchRemoteHeadSha({
      db: ctx.db,
      vault: ctx.vault,
      connectionId: repo.connectionId,
      owner: repo.owner,
      name: repo.name,
    });
    if (remoteSha && remoteSha !== row.headSha) {
      enqueuePrepForRepoLink(ctx, userId, repo);
      return null;
    }
  }

  void ctx.storage.sandboxPrep.touchUsed(row.prepKey).catch(() => {});
  return row.imageTag;
}
