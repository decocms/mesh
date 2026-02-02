/**
 * Extract GitHub repository owner and name from a repository URL
 * Supports formats like:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
export function extractGitHubRepo(repositoryUrl?: string | { url?: string }): {
  owner: string;
  repo: string;
} | null {
  if (!repositoryUrl) return null;

  const url =
    typeof repositoryUrl === "string" ? repositoryUrl : repositoryUrl.url;
  if (!url) return null;

  // Handle GitHub URLs
  const githubMatch = url.match(
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  );
  if (githubMatch) {
    return {
      owner: githubMatch[1] || "",
      repo: githubMatch[2] || "",
    };
  }

  return null;
}

/**
 * Get GitHub avatar URL for a repository
 * Uses a proxy service to bypass CORS issues with GitHub's avatar URLs
 */
export function getGitHubAvatarUrl(
  repositoryUrl?: string | { url?: string },
): string | null {
  const repo = extractGitHubRepo(repositoryUrl);
  if (!repo) return null;

  // GitHub's direct avatar URL has CORS issues, so we use a proxy
  // Using images.weserv.nl as a free image proxy service
  const githubAvatarUrl = `https://github.com/${repo.owner}.png`;
  const avatarUrl = `https://images.weserv.nl/?url=${encodeURIComponent(githubAvatarUrl)}&output=webp`;
  return avatarUrl;
}
