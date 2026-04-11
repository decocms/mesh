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

    const headers = {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    type GitHubInstallation = {
      id: number;
      account: {
        login: string;
        avatar_url: string;
      };
    };

    const allInstallations: GitHubInstallation[] = [];
    let nextUrl: string | undefined =
      "https://api.github.com/user/installations?per_page=100";

    while (nextUrl) {
      const response: Response = await fetch(nextUrl, { headers });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        installations: GitHubInstallation[];
      };
      allInstallations.push(...data.installations);

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

    const installations = allInstallations.map((inst) => ({
      installationId: inst.id,
      orgName: inst.account.login,
      avatarUrl: inst.account.avatar_url,
    }));

    return { installations };
  },
});
