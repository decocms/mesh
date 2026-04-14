import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { DownstreamTokenStorage } from "../../storage/downstream-token";

const GITHUB_API = "https://api.github.com";

export const GITHUB_LIST_USER_ORGS = defineTool({
  name: "GITHUB_LIST_USER_ORGS",
  description:
    "List GitHub App installations (orgs/accounts) accessible to the authenticated user.",
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
    installations: z.array(
      z.object({
        installationId: z.number(),
        login: z.string(),
        avatarUrl: z.string(),
        type: z.string(),
      }),
    ),
    appSlug: z.string().nullable(),
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

    // GitHub App tokens use /user/installations instead of /user/orgs
    const installations: Array<{
      installationId: number;
      login: string;
      avatarUrl: string;
      type: string;
    }> = [];

    let appSlug: string | null = null;
    let page = 1;
    const perPage = 100;

    while (true) {
      const res = await fetch(
        `${GITHUB_API}/user/installations?per_page=${perPage}&page=${page}`,
        { headers },
      );

      if (!res.ok) {
        throw new Error(`GitHub /user/installations failed: ${res.status}`);
      }

      const data = (await res.json()) as {
        installations: Array<{
          id: number;
          account: { login: string; avatar_url: string; type: string };
          app_slug: string;
        }>;
        total_count: number;
      };

      for (const inst of data.installations) {
        if (!appSlug) appSlug = inst.app_slug;
        installations.push({
          installationId: inst.id,
          login: inst.account.login,
          avatarUrl: inst.account.avatar_url,
          type: inst.account.type,
        });
      }

      if (data.installations.length < perPage) break;
      page++;
    }

    return { installations, appSlug };
  },
});
