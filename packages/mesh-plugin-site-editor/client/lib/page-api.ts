/**
 * Page API helpers
 *
 * Client-side page CRUD using SITE_BINDING tools (READ_FILE, PUT_FILE, LIST_FILES).
 * These mirror the server-side CMS_PAGE_* tools but call through the plugin's
 * toolCaller which is connected to the site's MCP.
 */

import { nanoid } from "nanoid";
import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";

type ToolCaller = TypedToolCaller<SiteBinding>;

export interface PageSummary {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
}

export interface Page {
  id: string;
  path: string;
  title: string;
  blocks: unknown[];
  metadata: {
    description: string;
    createdAt: string;
    updatedAt: string;
  };
}

const PAGES_PREFIX = ".deco/pages/";

/**
 * List all pages from .deco/pages/
 */
export async function listPages(
  toolCaller: ToolCaller,
): Promise<PageSummary[]> {
  const listResult = await toolCaller("LIST_FILES", {
    prefix: PAGES_PREFIX,
  });

  if (!listResult.files || listResult.files.length === 0) {
    return [];
  }

  const pages: PageSummary[] = [];

  for (const file of listResult.files) {
    if (!file.path.endsWith(".json")) continue;

    try {
      const readResult = await toolCaller("READ_FILE", { path: file.path });
      const page = JSON.parse(readResult.content);

      if (page.deleted) continue;

      pages.push({
        id: page.id,
        path: page.path,
        title: page.title,
        updatedAt: page.metadata?.updatedAt ?? "",
      });
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  // Sort by updatedAt descending
  pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return pages;
}

/**
 * Get a single page by ID
 */
export async function getPage(
  toolCaller: ToolCaller,
  pageId: string,
): Promise<Page | null> {
  try {
    const result = await toolCaller("READ_FILE", {
      path: `${PAGES_PREFIX}${pageId}.json`,
    });

    const page = JSON.parse(result.content);
    if (page.deleted) return null;
    return page;
  } catch {
    return null;
  }
}

/**
 * Create a new page
 */
export async function createPage(
  toolCaller: ToolCaller,
  input: { title: string; path: string },
): Promise<Page> {
  const id = `page_${nanoid(8)}`;
  const now = new Date().toISOString();

  const page: Page = {
    id,
    path: input.path,
    title: input.title,
    blocks: [],
    metadata: {
      description: "",
      createdAt: now,
      updatedAt: now,
    },
  };

  await toolCaller("PUT_FILE", {
    path: `${PAGES_PREFIX}${id}.json`,
    content: JSON.stringify(page, null, 2),
  });

  return page;
}

/**
 * Update an existing page (partial update)
 */
export async function updatePage(
  toolCaller: ToolCaller,
  pageId: string,
  updates: { title?: string; path?: string; blocks?: unknown[] },
): Promise<Page> {
  const result = await toolCaller("READ_FILE", {
    path: `${PAGES_PREFIX}${pageId}.json`,
  });

  const page = JSON.parse(result.content) as Page;

  if (updates.title !== undefined) page.title = updates.title;
  if (updates.path !== undefined) page.path = updates.path;
  if (updates.blocks !== undefined) page.blocks = updates.blocks;

  page.metadata = {
    ...page.metadata,
    updatedAt: new Date().toISOString(),
  };

  await toolCaller("PUT_FILE", {
    path: `${PAGES_PREFIX}${pageId}.json`,
    content: JSON.stringify(page, null, 2),
  });

  return page;
}

/**
 * Delete a page by writing a tombstone
 *
 * Phase 1 limitation: SITE_BINDING doesn't include DELETE_FILE.
 * We write a tombstone JSON that list/get operations skip.
 */
export async function deletePage(
  toolCaller: ToolCaller,
  pageId: string,
): Promise<void> {
  await toolCaller("PUT_FILE", {
    path: `${PAGES_PREFIX}${pageId}.json`,
    content: JSON.stringify(
      { deleted: true, deletedAt: new Date().toISOString() },
      null,
      2,
    ),
  });
}
