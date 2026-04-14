import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { DownstreamTokenStorage } from "../../storage/downstream-token";

const GITHUB_API = "https://api.github.com";

export const GITHUB_LIST_USER_ORGS = defineTool({
  name: "GITHUB_LIST_USER_ORGS",
  description:
    "List the authenticated GitHub user's personal account and organizations.",
  annotations: {
    title: "List GitHub User Orgs",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    connectionId: z.string().describe("ID of the mcp-github connection to use"),
  }),
  outputSchema: z.object({
    user: z.object({
      login: z.string(),
      avatarUrl: z.string(),
    }),
    orgs: z.array(
      z.object({
        login: z.string(),
        avatarUrl: z.string(),
      }),
    ),
  }),
  handler: async (input, ctx) => {
    await ctx.access.check();

    const tokenStorage = new DownstreamTokenStorage(ctx.db, ctx.vault);
    const token = await tokenStorage.get(input.connectionId);
    if (!token) {
      throw new Error(
        "No GitHub token found. Ensure the mcp-github connection is authenticated.",
      );
    }

    const headers = {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const [userRes, orgsRes] = await Promise.all([
      fetch(`${GITHUB_API}/user`, { headers }),
      fetch(`${GITHUB_API}/user/orgs?per_page=100`, { headers }),
    ]);

    if (!userRes.ok) {
      throw new Error(`GitHub /user failed: ${userRes.status}`);
    }
    if (!orgsRes.ok) {
      throw new Error(`GitHub /user/orgs failed: ${orgsRes.status}`);
    }

    const userData = (await userRes.json()) as {
      login: string;
      avatar_url: string;
    };
    const orgsData = (await orgsRes.json()) as Array<{
      login: string;
      avatar_url: string;
    }>;

    return {
      user: {
        login: userData.login,
        avatarUrl: userData.avatar_url,
      },
      orgs: orgsData.map((o) => ({
        login: o.login,
        avatarUrl: o.avatar_url,
      })),
    };
  },
});
