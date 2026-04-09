/**
 * GITHUB_LIST_REPOS Tool
 *
 * Lists repositories accessible under a GitHub App installation.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { getUserId, requireAuth } from "../../core/mesh-context";

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
    installationId: z.number().describe("GitHub App installation ID"),
  }),
  outputSchema: z.object({
    repos: z.array(RepoSchema),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    const accounts = await ctx.db
      .selectFrom("account")
      .selectAll()
      .where("userId", "=", userId)
      .where("providerId", "=", "github")
      .execute();

    if (accounts.length === 0) {
      throw new Error("No GitHub account linked");
    }

    const accessToken = accounts[0]!.accessToken;
    if (!accessToken) {
      throw new Error("No GitHub access token available");
    }

    const response = await fetch(
      `https://api.github.com/user/installations/${input.installationId}/repositories`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      repositories: Array<{
        owner: { login: string };
        name: string;
        full_name: string;
        html_url: string;
        private: boolean;
      }>;
    };

    const repos = data.repositories.map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      private: repo.private,
    }));

    return { repos };
  },
});
