import type { GithubRepo, VirtualMCPEntity } from "@decocms/mesh-sdk/types";

/**
 * Returns the GitHub repo metadata only if its connectionId
 * exists in the Virtual MCP's connections array.
 * Returns null when the metadata is stale (connection removed).
 */
export function getActiveGithubRepo(
  virtualMcp: VirtualMCPEntity | null | undefined,
): GithubRepo | null {
  const repo = virtualMcp?.metadata?.githubRepo;
  if (!repo?.connectionId) return null;

  const hasConnection = virtualMcp?.connections?.some(
    (c) => c.connection_id === repo.connectionId,
  );

  return hasConnection ? repo : null;
}
