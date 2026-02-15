/**
 * CMS_BLOCK_REGISTER Tool
 *
 * Manually register a block definition without running the ts-morph scanner.
 * Useful for components the scanner can't analyze, or for hand-crafted block definitions.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { createSiteProxy } from "../site-proxy";

/**
 * Derive a block ID from a component path.
 * e.g., "sections/Hero.tsx" -> "sections--Hero"
 */
function componentToId(component: string): string {
  return component
    .replace(/\.\w+$/, "") // strip extension
    .replace(/\//g, "--"); // replace / with --
}

export const BLOCK_REGISTER: ServerPluginToolDefinition = {
  name: "CMS_BLOCK_REGISTER",
  description:
    "Manually register a block definition without running the scanner.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    block: z.object({
      component: z
        .string()
        .describe("Component file path (e.g., sections/Hero.tsx)"),
      label: z.string().describe("Human-readable label"),
      category: z.string().optional().describe("Block category"),
      description: z.string().optional().describe("Block description"),
      schema: z
        .record(z.string(), z.unknown())
        .describe("JSON Schema for the block props"),
      defaults: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Default prop values"),
    }),
  }),
  outputSchema: z.object({
    block: z.object({
      id: z.string(),
      component: z.string(),
      label: z.string(),
      category: z.string(),
      propsCount: z.number(),
    }),
  }),

  handler: async (input, ctx) => {
    const { connectionId, block: blockInput } = input as {
      connectionId: string;
      block: {
        component: string;
        label: string;
        category?: string;
        description?: string;
        schema: Record<string, unknown>;
        defaults?: Record<string, unknown>;
      };
    };
    const proxy = await createSiteProxy(await ctx.createMCPProxy(connectionId));

    try {
      const id = componentToId(blockInput.component);
      const firstSegment = blockInput.component.split("/")[0] ?? "Other";
      const category =
        blockInput.category ??
        firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);

      const now = new Date().toISOString();

      const blockDef = {
        id,
        component: blockInput.component,
        label: blockInput.label,
        category,
        description: blockInput.description ?? "",
        schema: blockInput.schema,
        defaults: blockInput.defaults ?? {},
        metadata: {
          scannedAt: now,
          scanMethod: "manual" as const,
          propsTypeName: null,
          customized: [] as string[],
        },
      };

      await proxy.callTool({
        name: "PUT_FILE",
        arguments: {
          path: `.deco/blocks/${id}.json`,
          content: JSON.stringify(blockDef, null, 2),
        },
      });

      const propsCount = Object.keys(
        (blockInput.schema as Record<string, unknown>).properties ?? {},
      ).length;

      return {
        block: {
          id,
          component: blockInput.component,
          label: blockInput.label,
          category,
          propsCount,
        },
      };
    } finally {
      await proxy.close?.();
    }
  },
};
