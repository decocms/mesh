/**
 * Loader API helpers
 *
 * Client-side loader listing and fetching using SITE_BINDING tools (LIST_FILES, READ_FILE).
 * Follows the same pattern as block-api.ts -- calls through the plugin's toolCaller
 * which is connected to the site's MCP.
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";

type ToolCaller = TypedToolCaller<SiteBinding>;

/**
 * Loader summary returned by list operations.
 */
export interface LoaderSummary {
  id: string;
  source: string;
  label: string;
  category: string;
  inputParamsCount: number;
}

/**
 * Full loader definition returned by get operations.
 */
export interface LoaderDefinition {
  id: string;
  source: string;
  label: string;
  category: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    propsTypeName: string | null;
    returnTypeName: string | null;
    customized: string[];
  };
}

const LOADERS_PREFIX = ".deco/loaders/";

/**
 * List all loaders from .deco/loaders/
 */
export async function listLoaders(
  toolCaller: ToolCaller,
): Promise<LoaderSummary[]> {
  const listResult = await toolCaller("LIST_FILES", {
    prefix: LOADERS_PREFIX,
  });

  if (!listResult.files || listResult.files.length === 0) {
    return [];
  }

  const loaders: LoaderSummary[] = [];

  for (const file of listResult.files) {
    if (!file.path.endsWith(".json")) continue;

    try {
      const readResult = await toolCaller("READ_FILE", { path: file.path });
      const loader = JSON.parse(readResult.content);

      if (loader.deleted) continue;

      const inputParamsCount = Object.keys(
        loader.inputSchema?.properties ?? {},
      ).length;

      loaders.push({
        id: loader.id,
        source: loader.source,
        label: loader.label,
        category: loader.category ?? "Other",
        inputParamsCount,
      });
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  // Sort by label alphabetically
  loaders.sort((a, b) => a.label.localeCompare(b.label));

  return loaders;
}

/**
 * Get a single loader definition by ID
 */
export async function getLoader(
  toolCaller: ToolCaller,
  loaderId: string,
): Promise<LoaderDefinition | null> {
  try {
    const result = await toolCaller("READ_FILE", {
      path: `${LOADERS_PREFIX}${loaderId}.json`,
    });

    const loader = JSON.parse(result.content);
    if (loader.deleted) return null;
    return loader;
  } catch {
    return null;
  }
}
