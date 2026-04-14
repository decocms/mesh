import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { DownstreamTokenStorage } from "../../storage/downstream-token";

const GITHUB_API = "https://api.github.com";

export const GITHUB_LIST_ORG_REPOS = defineTool({
  name: "GITHUB_LIST_ORG_REPOS",
  description:
    "List repositories for a GitHub organization or user account, sorted by last updated.",
  annotations: {
    title: "List GitHub Org Repos",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    connectionId: z.string().describe("ID of the mcp-github connection to use"),
    org: z.string().describe("GitHub org login or username"),
    page: z.number().optional().default(1).describe("Page number (default 1)"),
    perPage: z
      .number()
      .optional()
      .default(30)
      .describe("Results per page (default 30)"),
  }),
  outputSchema: z.object({
    repos: z.array(
      z.object({
        name: z.string(),
        fullName: z.string(),
        owner: z.string(),
        url: z.string(),
        private: z.boolean(),
        description: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
    hasMore: z.boolean(),
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

    const params = new URLSearchParams({
      sort: "updated",
      per_page: String(input.perPage),
      page: String(input.page),
    });

    // Try org endpoint first, fall back to user endpoint on 404
    let res = await fetch(`${GITHUB_API}/orgs/${input.org}/repos?${params}`, {
      headers,
    });

    if (res.status === 404) {
      res = await fetch(`${GITHUB_API}/users/${input.org}/repos?${params}`, {
        headers,
      });
    }

    if (!res.ok) {
      throw new Error(`GitHub repos fetch failed: ${res.status}`);
    }

    const data = (await res.json()) as Array<{
      name: string;
      full_name: string;
      owner: { login: string };
      html_url: string;
      private: boolean;
      description: string | null;
      updated_at: string;
    }>;

    return {
      repos: data.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        owner: r.owner.login,
        url: r.html_url,
        private: r.private,
        description: r.description,
        updatedAt: r.updated_at,
      })),
      hasMore: data.length === input.perPage,
    };
  },
});
