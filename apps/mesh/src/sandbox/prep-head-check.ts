/**
 * Remote HEAD revalidation for prep images.
 *
 * A baked prep image carries a snapshot of the repo at `row.headSha`. The
 * prep system has no automatic way to notice that the user pushed new
 * commits — so before handing out a `ready` image to a new thread, we
 * cheaply check whether the repo's default branch still points at the SHA
 * we baked. If it moved, the caller invalidates the row and re-enqueues.
 *
 * Design constraints:
 *   - Must not add noticeable latency to thread provisioning. We cache
 *     results in-process for `HEAD_CHECK_TTL_MS` so the common-case cost
 *     is zero after the first hit.
 *   - Must not burn GitHub rate limit. The cache key is (owner, name) so
 *     multiple users linked to the same repo share a single check.
 *   - Must fail open. Network errors, rate-limit throttles, deleted repos
 *     — none of these should invalidate a working image.
 *
 * We ask GitHub for the latest commit on the default branch via a single
 * `GET /repos/:owner/:name/commits?per_page=1` call. That endpoint resolves
 * the default branch server-side, so we don't need to know it ahead of time.
 * Note: if the prep was baked from a non-default branch (not currently
 * supported by the baker — `git clone` takes default), this check would
 * spuriously invalidate.
 */

import type { Kysely } from "kysely";
import { DownstreamTokenStorage } from "@/storage/downstream-token";
import type { CredentialVault } from "@/encryption/credential-vault";
import type { Database } from "@/storage/types";

/**
 * Per-process in-memory cache. A deployment with multiple mesh pods pays
 * one check per pod per window — acceptable and avoids a DB column +
 * migration. Correctness is unaffected by stale pod-local cache: each pod
 * independently discovers drift on its own schedule.
 */
const HEAD_CHECK_TTL_MS = 60_000;
const headCache = new Map<string, { checkedAt: number; sha: string | null }>();

export interface HeadCheckInput {
  db: Kysely<Database>;
  vault: CredentialVault;
  connectionId: string;
  owner: string;
  name: string;
}

/**
 * Returns the current default-branch HEAD SHA for the repo, or `null` if
 * the check could not be completed. `null` is the fail-open sentinel —
 * callers should treat it as "no opinion", not "stale".
 */
export async function fetchRemoteHeadSha(
  input: HeadCheckInput,
): Promise<string | null> {
  const key = `${input.owner}/${input.name}`;
  const cached = headCache.get(key);
  const now = Date.now();
  if (cached && now - cached.checkedAt < HEAD_CHECK_TTL_MS) {
    return cached.sha;
  }

  const sha = await tryFetchHeadSha(input);
  headCache.set(key, { checkedAt: now, sha });
  return sha;
}

/** Drop the cached entry for a repo — e.g. after a manual invalidation. */
export function forgetHeadCache(owner: string, name: string): void {
  headCache.delete(`${owner}/${name}`);
}

async function tryFetchHeadSha(input: HeadCheckInput): Promise<string | null> {
  let accessToken: string;
  try {
    const tokenStorage = new DownstreamTokenStorage(input.db, input.vault);
    const token = await tokenStorage.get(input.connectionId);
    if (!token) return null;
    accessToken = token.accessToken;
  } catch {
    return null;
  }

  try {
    // `per_page=1` + default-branch default = one-shot HEAD SHA without
    // needing to resolve the default branch first.
    const url = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}/commits?per_page=1`;
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // Belt-and-braces timeout — GitHub is usually fast, but a hung
      // request would stall thread provisioning.
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Array<{ sha?: string }>;
    const sha = body[0]?.sha;
    return typeof sha === "string" && sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}
