/**
 * CMS_BLOCK_SCAN Tool
 *
 * Scans a site's TypeScript codebase via MCP to discover React components,
 * generate JSON Schema for their props, and write block definitions to .deco/blocks/.
 *
 * Pipeline: createProjectFromMCP -> discoverComponents -> generateSchema -> write blocks
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { createProjectFromMCP } from "../scanner/extract.js";
import { discoverComponents } from "../scanner/discover.js";
import { generateSchema } from "../scanner/schema.js";
import type { BlockDefinition, BlockSummary } from "../scanner/types.js";

const DEFAULT_PATTERNS = ["sections/", "components/"];

/**
 * Derive a block ID from a component path.
 * e.g., "sections/Hero.tsx" -> "sections--Hero"
 */
function componentToId(component: string): string {
  return component
    .replace(/\.\w+$/, "") // strip extension
    .replace(/\//g, "--"); // replace / with --
}

/**
 * Convert a component name to a human-readable label.
 * e.g., "HeroBanner" -> "Hero Banner"
 */
function nameToLabel(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Derive category from the first directory segment.
 * e.g., "sections/Hero.tsx" -> "Sections"
 */
function componentToCategory(component: string): string {
  const firstSegment = component.split("/")[0] ?? "Other";
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

export const BLOCK_SCAN: ServerPluginToolDefinition = {
  name: "CMS_BLOCK_SCAN",
  description:
    "Scan a site's TypeScript codebase and generate block definitions in .deco/blocks/",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    patterns: z
      .array(z.string())
      .optional()
      .describe(
        "File path prefixes to scan (default: ['sections/', 'components/'])",
      ),
  }),
  outputSchema: z.object({
    blocks: z.array(
      z.object({
        id: z.string(),
        component: z.string(),
        label: z.string(),
        category: z.string(),
        propsCount: z.number(),
      }),
    ),
    errors: z.array(z.string()),
  }),

  handler: async (input, ctx) => {
    const { connectionId, patterns = DEFAULT_PATTERNS } = input as {
      connectionId: string;
      patterns?: string[];
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    const blocks: BlockSummary[] = [];
    const errors: string[] = [];

    try {
      // 1. Build in-memory ts-morph project from MCP files
      const project = await createProjectFromMCP(proxy, patterns);

      // 2. Discover components
      const components = discoverComponents(project);

      // 3. For each component, generate schema and write block definition
      for (const comp of components) {
        try {
          // Normalize the component path (strip leading /)
          const component = comp.filePath.startsWith("/")
            ? comp.filePath.slice(1)
            : comp.filePath;
          const id = componentToId(component);
          const label = nameToLabel(comp.name);
          const category = componentToCategory(component);

          // Generate JSON Schema for the props type
          let schema = { type: "object" as const, additionalProperties: true };
          if (comp.propsTypeName) {
            schema = generateSchema(
              project,
              comp.propsTypeName,
              comp.filePath,
            ) as typeof schema;
          }

          const propsCount = Object.keys(
            (schema as Record<string, unknown>).properties ?? {},
          ).length;

          // Check if an existing definition has customized fields to preserve
          const blockDef = await buildBlockDefinition(
            proxy,
            id,
            component,
            label,
            category,
            comp.jsDocDescription,
            schema,
            comp.propsTypeName,
          );

          // Write block definition
          await proxy.callTool({
            name: "PUT_FILE",
            arguments: {
              path: `.deco/blocks/${id}.json`,
              content: JSON.stringify(blockDef, null, 2),
            },
          });

          blocks.push({ id, component, label, category, propsCount });
        } catch (err) {
          errors.push(
            `Failed to process ${comp.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      await proxy.close?.();
    }

    return { blocks, errors };
  },
};

/**
 * Build a BlockDefinition, merging with existing data if user has customized fields.
 */
async function buildBlockDefinition(
  // deno-lint-ignore no-explicit-any
  proxy: any,
  id: string,
  component: string,
  label: string,
  category: string,
  description: string,
  schema: Record<string, unknown>,
  propsTypeName: string | null,
): Promise<BlockDefinition> {
  const now = new Date().toISOString();

  const newDef: BlockDefinition = {
    id,
    component,
    label,
    category,
    description,
    schema,
    defaults: {},
    metadata: {
      scannedAt: now,
      scanMethod: "ts-morph",
      propsTypeName,
      customized: [],
    },
  };

  // Try to read existing block to preserve customized fields
  try {
    const readResult = await proxy.callTool({
      name: "READ_FILE",
      arguments: { path: `.deco/blocks/${id}.json` },
    });

    const content = readResult.content?.[0]?.text;
    if (content) {
      const existing = JSON.parse(content) as BlockDefinition;
      const customized = existing.metadata?.customized ?? [];

      if (customized.length > 0) {
        // Preserve user-customized fields
        if (customized.includes("label")) newDef.label = existing.label;
        if (customized.includes("description")) {
          newDef.description = existing.description;
        }
        if (customized.includes("category")) {
          newDef.category = existing.category;
        }
        if (customized.includes("defaults")) {
          newDef.defaults = existing.defaults;
        }
        newDef.metadata.customized = customized;
      }
    }
  } catch {
    // No existing block -- use new definition as-is
  }

  return newDef;
}
