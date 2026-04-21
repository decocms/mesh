/**
 * Build an authenticated GitHub clone URL and git identity from a connection's
 * downstream OAuth token. Used by any runner (Freestyle VM, Docker sandbox)
 * that clones a user-connected repo into an execution environment.
 *
 * Falls back to generic defaults when the GitHub /user call fails so callers
 * never block on a flaky upstream.
 */

import type { Kysely } from "kysely";
import { DownstreamTokenStorage } from "../storage/downstream-token";
import type { Database } from "../storage/types";
import type { CredentialVault } from "../encryption/credential-vault";

export interface GitHubCloneInfo {
  cloneUrl: string;
  gitUserName: string;
  gitUserEmail: string;
}

export async function buildCloneInfo(
  connectionId: string,
  owner: string,
  name: string,
  db: Kysely<Database>,
  vault: CredentialVault,
): Promise<GitHubCloneInfo> {
  const tokenStorage = new DownstreamTokenStorage(db, vault);
  const token = await tokenStorage.get(connectionId);
  if (!token) {
    throw new Error(
      "No GitHub token found. Ensure the mcp-github connection is authenticated.",
    );
  }
  const cloneUrl = `https://x-access-token:${token.accessToken}@github.com/${owner}/${name}.git`;

  let gitUserName = "Deco Studio";
  let gitUserEmail = "studio@deco.cx";
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      const user = (await res.json()) as {
        name?: string | null;
        login: string;
        email?: string | null;
      };
      gitUserName = user.name || user.login;
      gitUserEmail = user.email || `${user.login}@users.noreply.github.com`;
    }
  } catch {
    // Fallback to defaults — don't block the caller.
  }

  return { cloneUrl, gitUserName, gitUserEmail };
}
