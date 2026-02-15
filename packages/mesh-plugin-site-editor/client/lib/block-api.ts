/**
 * Block API helpers
 *
 * Client-side block listing and fetching using SITE_BINDING tools (LIST_FILES, READ_FILE).
 * Follows the same pattern as page-api.ts -- calls through the plugin's toolCaller
 * which is connected to the site's MCP.
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";

type ToolCaller = TypedToolCaller<SiteBinding>;

/**
 * Block summary returned by list operations.
 */
export interface BlockSummary {
  id: string;
  component: string;
  label: string;
  category: string;
  propsCount: number;
}

/**
 * Full block definition returned by get operations.
 */
export interface BlockDefinition {
  id: string;
  component: string;
  label: string;
  category: string;
  description: string;
  schema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    propsTypeName: string | null;
    customized: string[];
  };
}

const BLOCKS_PREFIX = ".deco/blocks/";

/**
 * List all blocks from .deco/blocks/
 */
export async function listBlocks(
  toolCaller: ToolCaller,
): Promise<BlockSummary[]> {
  const listResult = await toolCaller("LIST_FILES", {
    prefix: BLOCKS_PREFIX,
  });

  if (!listResult.files || listResult.files.length === 0) {
    return [];
  }

  const blocks: BlockSummary[] = [];

  for (const file of listResult.files) {
    if (!file.path.endsWith(".json")) continue;

    try {
      const readResult = await toolCaller("READ_FILE", { path: file.path });
      const block = JSON.parse(readResult.content);

      if (block.deleted) continue;

      const propsCount = Object.keys(block.schema?.properties ?? {}).length;

      blocks.push({
        id: block.id,
        component: block.component,
        label: block.label,
        category: block.category ?? "Other",
        propsCount,
      });
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  // Sort by label alphabetically
  blocks.sort((a, b) => a.label.localeCompare(b.label));

  return blocks;
}

/**
 * Get a single block definition by ID
 */
export async function getBlock(
  toolCaller: ToolCaller,
  blockId: string,
): Promise<BlockDefinition | null> {
  try {
    const result = await toolCaller("READ_FILE", {
      path: `${BLOCKS_PREFIX}${blockId}.json`,
    });

    const block = JSON.parse(result.content);
    if (block.deleted) return null;
    return block;
  } catch {
    return null;
  }
}
