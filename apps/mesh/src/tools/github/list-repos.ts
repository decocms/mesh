/**
 * GITHUB_LIST_REPOS Tool
 *
 * Lists repositories accessible under a GitHub App installation.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

const RepoSchema = z.object({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  url: z.string(),
  private: z.boolean(),
});

export const GITHUB_LIST_REPOS = defineTool({
  name: "GITHUB_LIST_REPOS",
  description: "List repositories accessible under a GitHub App installation.",
  annotations: {
    title: "List GitHub Repos",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    token: z.string().describe("GitHub access token"),
    installationId: z.number().describe("GitHub App installation ID"),
  }),
  outputSchema: z.object({
    repos: z.array(RepoSchema),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const headers = {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    type GitHubRepo = {
      owner: { login: string };
      name: string;
      full_name: string;
      html_url: string;
      private: boolean;
    };

    const allRepos: GitHubRepo[] = [];
    let nextUrl: string | undefined =
      `https://api.github.com/user/installations/${input.installationId}/repositories?per_page=100`;

    while (nextUrl) {
      const response: Response = await fetch(nextUrl, { headers });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = (await response.json()) as { repositories: GitHubRepo[] };
      allRepos.push(...data.repositories);

      // Parse Link header for next page
      nextUrl = undefined;
      const link = response.headers.get("link");
      if (link) {
        const next = link
          .split(",")
          .find((part: string) => part.includes('rel="next"'));
        if (next) {
          const match = next.match(/<([^>]+)>/);
          if (match?.[1]) nextUrl = match[1];
        }
      }
    }

    const repos = allRepos.map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      private: repo.private,
    }));

    return { repos };
  },
});
