import type { GithubRepo } from "@decocms/mesh-sdk/types";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { getActiveGithubRepo } from "@/web/lib/github-repo";

/**
 * Returns the active GitHub repo for the current Virtual MCP,
 * or null if the GitHub connection has been removed.
 */
export function useActiveGithubRepo(): GithubRepo | null {
  const inset = useInsetContext();
  return getActiveGithubRepo(inset?.entity);
}
