/**
 * GITHUB_LIST_INSTALLATIONS Tool
 *
 * Lists GitHub App installations of the Deco CMS app for the current user.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

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
  inputSchema: z.object({
    token: z.string().describe("GitHub access token"),
  }),
  outputSchema: z.object({
    installations: z.array(InstallationSchema),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const response = await fetch(
      "https://api.github.com/user/installations?per_page=100",
      {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

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

    return { installations };
  },
});
