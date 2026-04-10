/**
 * GITHUB_GET_FILE_CONTENT Tool
 *
 * Fetches raw file content from a GitHub repository.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

export const GITHUB_GET_FILE_CONTENT = defineTool({
  name: "GITHUB_GET_FILE_CONTENT",
  description: "Fetch raw file content from a GitHub repository by path.",
  annotations: {
    title: "Get GitHub File Content",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    token: z.string().describe("GitHub access token"),
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    path: z.string().describe("File path within the repository"),
  }),
  outputSchema: z.object({
    content: z.string().nullable(),
    found: z.boolean(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const url = `https://raw.githubusercontent.com/${input.owner}/${input.repo}/HEAD/${input.path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${input.token}`,
      },
    });

    if (response.status === 404) {
      return { content: null, found: false };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const content = await response.text();
    return { content, found: true };
  },
});
