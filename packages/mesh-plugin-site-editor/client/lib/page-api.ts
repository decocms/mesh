/**
 * Page API helpers
 *
 * Client-side page CRUD using SITE_BINDING tools (READ_FILE, PUT_FILE, LIST_FILES).
 * These mirror the server-side CMS_PAGE_* tools but call through the plugin's
 * toolCaller which is connected to the site's MCP.
 *
 * Supports page variants for i18n:
 * - page_home.json           → default variant
 * - page_home.en-US.json     → English variant
 * - page_home.pt-BR.json     → Portuguese variant
 *
 * The filename pattern is: {pageId}.{locale}.json (variant) or {pageId}.json (default)
 */

import { nanoid } from "nanoid";
import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";

type ToolCaller = TypedToolCaller<SiteBinding>;

/** Known locale pattern: 2-letter language + optional region */
const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * Parse a page filename into pageId and optional locale.
 * "page_home.json" → { pageId: "page_home", locale: null }
 * "page_home.en-US.json" → { pageId: "page_home", locale: "en-US" }
 */
function parsePageFilename(filename: string): {
  pageId: string;
  locale: string | null;
} {
  const base = filename.replace(/\.json$/, "");
  const lastDot = base.lastIndexOf(".");
  if (lastDot > 0) {
    const possibleLocale = base.substring(lastDot + 1);
    if (LOCALE_PATTERN.test(possibleLocale)) {
      return {
        pageId: base.substring(0, lastDot),
        locale: possibleLocale,
      };
    }
  }
  return { pageId: base, locale: null };
}

/** Get the filename for a page, optionally with locale */
function pageFilename(pageId: string, locale?: string | null): string {
  if (locale) return `${pageId}.${locale}.json`;
  return `${pageId}.json`;
}

export interface PageVariantInfo {
  locale: string;
  updatedAt: string;
}

export interface PageSummary {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
  /** Available locale variants (not including default) */
  variants: PageVariantInfo[];
}

export interface BlockInstance {
  /** Unique ID for this block instance on the page */
  id: string;
  /** Reference to block definition in .deco/blocks/ (e.g., "sections--Hero") */
  blockType: string;
  /** User-edited props for this instance */
  props: Record<string, unknown>;
}

/** Reference to a loader from a block instance prop value */
export interface LoaderRef {
  /** LoaderDefinition ID from .deco/loaders/ */
  __loaderRef: string;
  /** Optional: pick a specific field from loader output */
  field?: string;
  /** Configured input parameter values for this binding */
  params?: Record<string, unknown>;
}

/** Check if a prop value is a loader reference */
export function isLoaderRef(value: unknown): value is LoaderRef {
  return (
    value !== null &&
    typeof value === "object" &&
    "__loaderRef" in (value as Record<string, unknown>)
  );
}

export interface Page {
  id: string;
  path: string;
  title: string;
  locale?: string;
  blocks: BlockInstance[];
  metadata: {
    description: string;
    createdAt: string;
    updatedAt: string;
  };
}

const PAGES_PREFIX = ".deco/pages/";

/**
 * List all pages from .deco/pages/, grouping locale variants together.
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

  // First pass: read all files and group by pageId
  const pageMap = new Map<
    string,
    {
      default: { title: string; path: string; updatedAt: string } | null;
      variants: PageVariantInfo[];
    }
  >();

  for (const file of listResult.files) {
    if (!file.path.endsWith(".json")) continue;

    try {
      const readResult = await toolCaller("READ_FILE", { path: file.path });
      const page = JSON.parse(readResult.content);
      if (page.deleted) continue;

      const filename = file.path.split("/").pop() ?? "";
      const { pageId, locale } = parsePageFilename(filename);

      if (!pageMap.has(pageId)) {
        pageMap.set(pageId, { default: null, variants: [] });
      }
      const entry = pageMap.get(pageId)!;

      if (locale) {
        entry.variants.push({
          locale,
          updatedAt: page.metadata?.updatedAt ?? "",
        });
      } else {
        entry.default = {
          title: page.title,
          path: page.path,
          updatedAt: page.metadata?.updatedAt ?? "",
        };
      }
    } catch {
      continue;
    }
  }

  // Second pass: build summaries from grouped data
  const pages: PageSummary[] = [];
  for (const [pageId, entry] of pageMap) {
    if (!entry.default) continue; // Skip orphaned variants without a default
    pages.push({
      id: pageId,
      path: entry.default.path,
      title: entry.default.title,
      updatedAt: entry.default.updatedAt,
      variants: entry.variants.sort((a, b) => a.locale.localeCompare(b.locale)),
    });
  }

  // Sort by updatedAt descending
  pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return pages;
}

/**
 * Get a single page by ID, optionally for a specific locale variant.
 */
export async function getPage(
  toolCaller: ToolCaller,
  pageId: string,
  locale?: string | null,
): Promise<Page | null> {
  try {
    const result = await toolCaller("READ_FILE", {
      path: `${PAGES_PREFIX}${pageFilename(pageId, locale)}`,
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
 * Create a locale variant of an existing page by copying blocks from the default.
 */
export async function createPageVariant(
  toolCaller: ToolCaller,
  pageId: string,
  locale: string,
): Promise<Page> {
  // Read the default page
  const defaultPage = await getPage(toolCaller, pageId);
  if (!defaultPage) {
    throw new Error(`Default page ${pageId} not found`);
  }

  const now = new Date().toISOString();

  const variant: Page = {
    ...defaultPage,
    locale,
    metadata: {
      ...defaultPage.metadata,
      createdAt: now,
      updatedAt: now,
    },
  };

  await toolCaller("PUT_FILE", {
    path: `${PAGES_PREFIX}${pageFilename(pageId, locale)}`,
    content: JSON.stringify(variant, null, 2),
  });

  return variant;
}

/**
 * Update an existing page (partial update).
 * If locale is provided, updates the variant file.
 */
export async function updatePage(
  toolCaller: ToolCaller,
  pageId: string,
  updates: {
    title?: string;
    path?: string;
    blocks?: BlockInstance[];
  },
  locale?: string | null,
): Promise<Page> {
  const filename = pageFilename(pageId, locale);
  const result = await toolCaller("READ_FILE", {
    path: `${PAGES_PREFIX}${filename}`,
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
    path: `${PAGES_PREFIX}${filename}`,
    content: JSON.stringify(page, null, 2),
  });

  return page;
}

/**
 * Delete a page by writing a tombstone
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
