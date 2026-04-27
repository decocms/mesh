/**
 * Authenticated clone URL + bot git identity from a connection's downstream
 * App installation token. Makes no GitHub API call — the committer is the
 * Mesh GitHub App bot.
 */

import type { Kysely } from "kysely";
import { DownstreamTokenStorage } from "../storage/downstream-token";
import type { Database } from "../storage/types";
import type { CredentialVault } from "../encryption/credential-vault";
import {
  canRefresh,
  PROACTIVE_REFRESH_BUFFER_MS,
  RECONNECT_ERROR,
  refreshAndStore,
} from "../oauth/token-refresh";

export const MCP_GITHUB_BOT_NAME = "mcp-github[bot]";
export const MCP_GITHUB_BOT_EMAIL = "mcp-github[bot]@users.noreply.github.com";

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

  let accessToken = token.accessToken;

  if (
    canRefresh(token) &&
    tokenStorage.isExpired(token, PROACTIVE_REFRESH_BUFFER_MS)
  ) {
    const refreshed = await refreshAndStore(token, tokenStorage);
    if (!refreshed) {
      throw new Error(RECONNECT_ERROR);
    }
    accessToken = refreshed;
  }

  const cloneUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${name}.git`;

  return {
    cloneUrl,
    gitUserName: MCP_GITHUB_BOT_NAME,
    gitUserEmail: MCP_GITHUB_BOT_EMAIL,
  };
}
