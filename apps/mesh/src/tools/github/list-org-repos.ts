import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { DownstreamTokenStorage } from "../../storage/downstream-token";

const GITHUB_API = "https://api.github.com";

export const GITHUB_LIST_ORG_REPOS = defineTool({
  name: "GITHUB_LIST_ORG_REPOS",
  description:
    "List repositories for a GitHub App installation, sorted by last updated.",
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
    installationId: z
      .number()
      .describe("GitHub App installation ID to list repos for"),
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

    const res = await fetch(
      `${GITHUB_API}/user/installations/${input.installationId}/repositories?per_page=${input.perPage}&page=${input.page}`,
      { headers },
    );

    if (!res.ok) {
      throw new Error(`GitHub installation repos fetch failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      repositories: Array<{
        name: string;
        full_name: string;
        owner: { login: string };
        html_url: string;
        private: boolean;
        description: string | null;
        updated_at: string;
      }>;
      total_count: number;
    };

    // Sort by updated_at descending (most recent first)
    const sorted = data.repositories.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    return {
      repos: sorted.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        owner: r.owner.login,
        url: r.html_url,
        private: r.private,
        description: r.description,
        updatedAt: r.updated_at,
      })),
      hasMore: data.repositories.length === input.perPage,
    };
  },
});
