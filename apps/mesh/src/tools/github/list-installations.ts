/**
 * GITHUB_LIST_INSTALLATIONS Tool
 *
 * Lists GitHub App installations of the Deco CMS app for the current user.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { getUserId, requireAuth } from "../../core/mesh-context";

const InstallationSchema = z.object({
  installationId: z.number(),
  orgName: z.string(),
  avatarUrl: z.string().nullable(),
});

export const GITHUB_LIST_INSTALLATIONS = defineTool({
  name: "GITHUB_LIST_INSTALLATIONS",
  description:
    "List GitHub App installations of the Deco CMS app for the current user.",
  annotations: {
    title: "List GitHub Installations",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({}),
  outputSchema: z.object({
    installations: z.array(InstallationSchema),
    hasGithubAccount: z.boolean(),
  }),

  handler: async (_input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    // Look up the user's GitHub account in Better Auth's account table
    const accounts = await ctx.db
      .selectFrom("account")
      .selectAll()
      .where("userId", "=", userId)
      .where("providerId", "=", "github")
      .execute();

    if (accounts.length === 0) {
      return { installations: [], hasGithubAccount: false };
    }

    const githubAccount = accounts[0]!;
    const accessToken = githubAccount.accessToken;

    if (!accessToken) {
      return { installations: [], hasGithubAccount: true };
    }

    // Fetch user's installations from GitHub API
    const response = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      installations: Array<{
        id: number;
        account: {
          login: string;
          avatar_url: string;
        };
      }>;
    };

    const installations = data.installations.map((inst) => ({
      installationId: inst.id,
      orgName: inst.account.login,
      avatarUrl: inst.account.avatar_url,
    }));

    return { installations, hasGithubAccount: true };
  },
});
