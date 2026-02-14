/**
 * CMS File History Tools
 *
 * Server tools for retrieving file history and reading files at specific commits.
 * Proxies to GET_FILE_HISTORY and READ_FILE_AT via MCP.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const FILE_HISTORY: ServerPluginToolDefinition = {
  name: "CMS_FILE_HISTORY",
  description:
    "Get the commit history for a CMS file, showing who changed it and when.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    path: z.string().describe("File path relative to project root"),
    branch: z.string().optional().describe("Branch name (defaults to current)"),
    limit: z
      .number()
      .optional()
      .describe("Max entries to return (defaults to 50)"),
  }),
  outputSchema: z.object({
    entries: z.array(
      z.object({
        commitHash: z.string(),
        timestamp: z.number(),
        author: z.string(),
        message: z.string(),
      }),
    ),
  }),

  handler: async (input, ctx) => {
    const { connectionId, path, branch, limit } = input as {
      connectionId: string;
      path: string;
      branch?: string;
      limit?: number;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const result = await proxy.callTool({
        name: "GET_FILE_HISTORY",
        arguments: { path, branch, limit },
      });

      const content = result.content?.[0]?.text;
      if (!content) {
        return { entries: [] };
      }

      try {
        return JSON.parse(content);
      } catch {
        return { entries: [] };
      }
    } catch {
      // History tools not supported by this MCP
      return { entries: [] };
    } finally {
      await proxy.close?.();
    }
  },
};

export const FILE_READ_AT: ServerPluginToolDefinition = {
  name: "CMS_FILE_READ_AT",
  description: "Read a CMS file's content at a specific commit hash.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    path: z.string().describe("File path relative to project root"),
    commitHash: z.string().describe("Git commit SHA to read from"),
  }),
  outputSchema: z.object({
    content: z.string(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, path, commitHash } = input as {
      connectionId: string;
      path: string;
      commitHash: string;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const result = await proxy.callTool({
        name: "READ_FILE_AT",
        arguments: { path, commitHash },
      });

      const content = result.content?.[0]?.text;
      if (!content) {
        return { content: "" };
      }

      try {
        return JSON.parse(content);
      } catch {
        // If the response is plain text (not JSON-wrapped), return it directly
        return { content };
      }
    } catch {
      return { content: "" };
    } finally {
      await proxy.close?.();
    }
  },
};
