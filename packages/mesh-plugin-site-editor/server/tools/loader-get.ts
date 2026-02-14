/**
 * CMS_LOADER_GET Tool
 *
 * Reads a single loader definition by ID from .deco/loaders/{loaderId}.json via MCP.
 * Returns the full LoaderDefinition including input and output JSON Schemas.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const LOADER_GET: ServerPluginToolDefinition = {
  name: "CMS_LOADER_GET",
  description:
    "Get a single CMS loader definition by ID, including its full input and output JSON Schemas.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    loaderId: z.string().describe('Loader ID (e.g., "loaders--productList")'),
  }),
  outputSchema: z.object({
    loader: z
      .object({
        id: z.string(),
        source: z.string(),
        label: z.string(),
        category: z.string(),
        description: z.string(),
        inputSchema: z.record(z.string(), z.unknown()),
        outputSchema: z.record(z.string(), z.unknown()),
        defaults: z.record(z.string(), z.unknown()),
        metadata: z.object({
          scannedAt: z.string(),
          scanMethod: z.string(),
          propsTypeName: z.string().nullable(),
          returnTypeName: z.string().nullable(),
          customized: z.array(z.string()),
        }),
      })
      .nullable(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, loaderId } = input as {
      connectionId: string;
      loaderId: string;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const readResult = await proxy.callTool({
        name: "READ_FILE",
        arguments: { path: `.deco/loaders/${loaderId}.json` },
      });

      if (readResult.isError) {
        return { loader: null };
      }

      const content = readResult.content?.[0]?.text;
      if (!content) {
        return { loader: null };
      }

      try {
        const loader = JSON.parse(content);
        if (loader.deleted) {
          return { loader: null };
        }
        return { loader };
      } catch {
        return { loader: null };
      }
    } finally {
      await proxy.close?.();
    }
  },
};
