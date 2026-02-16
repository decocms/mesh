/**
 * Loader API helpers
 *
 * Client-side loader listing and fetching using SITE_BINDING tools (LIST_FILES, READ_FILE).
 * Follows the same pattern as block-api.ts -- calls through the plugin's toolCaller
 * which is connected to the site's MCP.
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";
import { listPages, getPage, isLoaderRef } from "./page-api";

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

/**
 * Build a map of loaderId -> section names that consume the loader.
 * Walks all pages and their block instances, checking each prop value
 * for LoaderRef references.
 */
export async function computeLoaderSectionMap(
  toolCaller: ToolCaller,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const pageSummaries = await listPages(toolCaller);

  for (const summary of pageSummaries) {
    const page = await getPage(toolCaller, summary.id);
    if (!page) continue;

    for (const block of page.blocks) {
      for (const value of Object.values(block.props)) {
        if (!isLoaderRef(value)) continue;

        const loaderId = value.__loaderRef;
        // Derive section name from blockType: remove "sections--" prefix, replace "--" with "/"
        const sectionName = block.blockType
          .replace(/^sections--/, "")
          .replace(/--/g, "/");

        let sections = map.get(loaderId);
        if (!sections) {
          sections = [];
          map.set(loaderId, sections);
        }
        if (!sections.includes(sectionName)) {
          sections.push(sectionName);
        }
      }
    }
  }

  return map;
}
