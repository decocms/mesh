/**
 * Firecrawl Binding
 *
 * Matches the official firecrawl-mcp tools:
 * - firecrawl_scrape: Scrape individual URLs
 * - firecrawl_crawl: Crawl entire websites
 * - firecrawl_map: Map website structure
 * - firecrawl_search: Search with content extraction
 * - firecrawl_extract: Extract structured data
 * - firecrawl_check_crawl_status: Monitor crawl progress
 */
import { z } from "zod";
import { type ToolBinder, bindingClient } from "../core/binder";

/**
 * Common scrape options schema
 */
const ScrapeOptionsSchema = z
  .object({
    formats: z.array(z.string()).optional(),
    onlyMainContent: z.boolean().optional(),
    includeTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    waitFor: z.number().optional(),
    timeout: z.number().optional(),
  })
  .optional();

/**
 * Firecrawl scrape input schema
 */
const FirecrawlScrapeInputSchema = z.object({
  url: z.string().describe("The URL to scrape"),
  formats: z.array(z.string()).optional(),
  onlyMainContent: z.boolean().optional(),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  waitFor: z.number().optional(),
  timeout: z.number().optional(),
  mobile: z.boolean().optional(),
  actions: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * Firecrawl crawl input schema
 */
const FirecrawlCrawlInputSchema = z.object({
  url: z.string().describe("The URL to start crawling from"),
  maxDepth: z.number().optional(),
  limit: z.number().optional(),
  allowBackwardLinks: z.boolean().optional(),
  allowExternalLinks: z.boolean().optional(),
  ignoreSitemap: z.boolean().optional(),
  scrapeOptions: ScrapeOptionsSchema,
});

/**
 * Firecrawl map input schema
 */
const FirecrawlMapInputSchema = z.object({
  url: z.string().describe("The URL to map"),
  search: z.string().optional(),
  ignoreSitemap: z.boolean().optional(),
  includeSubdomains: z.boolean().optional(),
  limit: z.number().optional(),
});

/**
 * Firecrawl search input schema
 */
const FirecrawlSearchInputSchema = z.object({
  query: z.string().describe("Search query"),
  limit: z.number().optional(),
  lang: z.string().optional(),
  country: z.string().optional(),
  scrapeOptions: ScrapeOptionsSchema,
});

/**
 * Firecrawl extract input schema
 */
const FirecrawlExtractInputSchema = z.object({
  urls: z.array(z.string()).describe("URLs to extract from"),
  prompt: z.string().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  enableWebSearch: z.boolean().optional(),
});

/**
 * Firecrawl check crawl status input schema
 */
const FirecrawlCheckCrawlStatusInputSchema = z.object({
  id: z.string().describe("The crawl job ID"),
});

/**
 * Generic output schema for firecrawl responses
 */
const FirecrawlOutputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

/**
 * Firecrawl binding definition
 *
 * Matches any MCP with firecrawl_scrape tool.
 * Other tools are optional.
 */
export const FIRECRAWL_BINDING = [
  {
    name: "firecrawl_scrape" as const,
    inputSchema: FirecrawlScrapeInputSchema,
    outputSchema: FirecrawlOutputSchema,
  },
  {
    name: "firecrawl_crawl" as const,
    inputSchema: FirecrawlCrawlInputSchema,
    outputSchema: FirecrawlOutputSchema,
    opt: true,
  },
  {
    name: "firecrawl_map" as const,
    inputSchema: FirecrawlMapInputSchema,
    outputSchema: FirecrawlOutputSchema,
    opt: true,
  },
  {
    name: "firecrawl_search" as const,
    inputSchema: FirecrawlSearchInputSchema,
    outputSchema: FirecrawlOutputSchema,
    opt: true,
  },
  {
    name: "firecrawl_extract" as const,
    inputSchema: FirecrawlExtractInputSchema,
    outputSchema: FirecrawlOutputSchema,
    opt: true,
  },
  {
    name: "firecrawl_check_crawl_status" as const,
    inputSchema: FirecrawlCheckCrawlStatusInputSchema,
    outputSchema: FirecrawlOutputSchema,
    opt: true,
  },
] satisfies ToolBinder[];

export const FirecrawlBinding = bindingClient(FIRECRAWL_BINDING);
