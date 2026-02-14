/**
 * CMS_LOADER_SCAN Tool
 *
 * Scans a site's TypeScript codebase via MCP to discover loader functions,
 * generate JSON Schema for their input params and output, and write loader
 * definitions to .deco/loaders/.
 *
 * Pipeline: createProjectFromMCP -> discoverLoaders -> generateSchema -> write loaders
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { createProjectFromMCP } from "../scanner/extract.js";
import { discoverLoaders } from "../scanner/discover.js";
import { generateSchema } from "../scanner/schema.js";
import type { LoaderDefinition, LoaderSummary } from "../scanner/types.js";

const DEFAULT_PATTERNS = ["loaders/"];

/**
 * Derive a loader ID from a source path.
 * e.g., "loaders/productList.ts" -> "loaders--productList"
 */
function sourceToId(source: string): string {
  return source
    .replace(/\.\w+$/, "") // strip extension
    .replace(/\//g, "--"); // replace / with --
}

/**
 * Convert a loader name to a human-readable label.
 * e.g., "productList" -> "Product List"
 */
function nameToLabel(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Derive category from the first directory segment.
 * e.g., "loaders/productList.ts" -> "Loaders"
 */
function sourceToCategory(source: string): string {
  const firstSegment = source.split("/")[0] ?? "Other";
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
}

export const LOADER_SCAN: ServerPluginToolDefinition = {
  name: "CMS_LOADER_SCAN",
  description:
    "Scan a site's TypeScript codebase and generate loader definitions in .deco/loaders/",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    patterns: z
      .array(z.string())
      .optional()
      .describe("File path prefixes to scan (default: ['loaders/'])"),
  }),
  outputSchema: z.object({
    loaders: z.array(
      z.object({
        id: z.string(),
        source: z.string(),
        label: z.string(),
        category: z.string(),
        inputParamsCount: z.number(),
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

    const loaders: LoaderSummary[] = [];
    const errors: string[] = [];

    try {
      // 1. Build in-memory ts-morph project from MCP files
      const project = await createProjectFromMCP(proxy, patterns);

      // 2. Discover loaders
      const discovered = discoverLoaders(project);

      // 3. For each loader, generate schemas and write loader definition
      for (const loader of discovered) {
        try {
          // Normalize the source path (strip leading /)
          const source = loader.filePath.startsWith("/")
            ? loader.filePath.slice(1)
            : loader.filePath;
          const id = sourceToId(source);
          const label = nameToLabel(loader.name);
          const category = sourceToCategory(source);

          // Generate JSON Schema for input params (Props type)
          let inputSchema: Record<string, unknown> = {
            type: "object",
            properties: {},
            additionalProperties: false,
          };
          if (loader.propsTypeName) {
            inputSchema = generateSchema(
              project,
              loader.propsTypeName,
              loader.filePath,
            ) as typeof inputSchema;
          }

          // Generate JSON Schema for output (return type)
          let outputSchema: Record<string, unknown> = {
            type: "object",
            additionalProperties: true,
          };
          if (loader.returnTypeName) {
            outputSchema = generateSchema(
              project,
              loader.returnTypeName,
              loader.filePath,
            ) as typeof outputSchema;
          }

          const inputParamsCount = Object.keys(
            (inputSchema as Record<string, unknown>).properties ?? {},
          ).length;

          // Build loader definition, merging with existing if needed
          const loaderDef = await buildLoaderDefinition(
            proxy,
            id,
            source,
            label,
            category,
            loader.jsDocDescription,
            inputSchema,
            outputSchema,
            loader.propsTypeName,
            loader.returnTypeName,
          );

          // Write loader definition
          await proxy.callTool({
            name: "PUT_FILE",
            arguments: {
              path: `.deco/loaders/${id}.json`,
              content: JSON.stringify(loaderDef, null, 2),
            },
          });

          loaders.push({ id, source, label, category, inputParamsCount });
        } catch (err) {
          errors.push(
            `Failed to process ${loader.name}: ${err instanceof Error ? err.message : String(err)}`,
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

    return { loaders, errors };
  },
};

/**
 * Build a LoaderDefinition, merging with existing data if user has customized fields.
 */
async function buildLoaderDefinition(
  // deno-lint-ignore no-explicit-any
  proxy: any,
  id: string,
  source: string,
  label: string,
  category: string,
  description: string,
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  propsTypeName: string | null,
  returnTypeName: string | null,
): Promise<LoaderDefinition> {
  const now = new Date().toISOString();

  const newDef: LoaderDefinition = {
    id,
    source,
    label,
    category,
    description,
    inputSchema,
    outputSchema,
    defaults: {},
    metadata: {
      scannedAt: now,
      scanMethod: "ts-morph",
      propsTypeName,
      returnTypeName,
      customized: [],
    },
  };

  // Try to read existing loader to preserve customized fields
  try {
    const readResult = await proxy.callTool({
      name: "READ_FILE",
      arguments: { path: `.deco/loaders/${id}.json` },
    });

    const content = readResult.content?.[0]?.text;
    if (content) {
      const existing = JSON.parse(content) as LoaderDefinition;
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
    // No existing loader -- use new definition as-is
  }

  return newDef;
}
