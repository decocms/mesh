import type { ResearchStep } from "./types";

/**
 * Static step definitions for the site research pipeline.
 *
 * Each step maps to a tool available on the configured Virtual MCP.
 * The runner iterates these in order, checks dependencies, calls the tool,
 * and writes the result to object storage.
 */
export const RESEARCH_STEPS: ResearchStep[] = [
  {
    id: "crawl",
    label: "Crawling site",
    toolName: "SITE_CRAWL",
    buildInput: (ctx) => ({ url: ctx.url }),
    outputFile: "crawl.json",
  },
  {
    id: "brand",
    label: "Researching brand",
    toolName: "BRAND_RESEARCH",
    buildInput: (ctx) => ({
      url: ctx.url,
      siteStructure: ctx.outputs.crawl,
    }),
    outputFile: "brand.json",
    dependsOn: ["crawl"],
  },
  {
    id: "seo",
    label: "Analyzing SEO",
    toolName: "SEO_ANALYSIS",
    buildInput: (ctx) => ({
      url: ctx.url,
      crawlData: ctx.outputs.crawl,
    }),
    outputFile: "seo.json",
    dependsOn: ["crawl"],
  },
];
