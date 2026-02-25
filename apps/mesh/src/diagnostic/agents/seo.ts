/**
 * SEO Diagnostic Agent
 *
 * Extracts SEO signals from a crawled page's HTML.
 * Standalone async function — no MeshContext dependency.
 */

import type { CrawlResult } from "../crawl";

export interface HeadingItem {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface StructuredDataItem {
  type: string;
  data: Record<string, unknown>;
}

export interface SeoResult {
  title?: string;
  metaDescription?: string;
  ogTags: Record<string, string>;
  canonicalUrl?: string;
  headings: HeadingItem[];
  robotsMeta?: string;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  structuredData: StructuredDataItem[];
}

/**
 * Extract text content from an HTML tag match.
 * Handles multi-line content and trims whitespace.
 */
function extractTagContent(
  html: string,
  tagPattern: RegExp,
): string | undefined {
  const match = html.match(tagPattern);
  if (!match?.[1]) return undefined;
  return (
    match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim() || undefined
  );
}

/**
 * Extract a meta tag attribute value.
 */
function extractMetaContent(
  html: string,
  nameOrProperty: string,
  attribute: "name" | "property",
): string | undefined {
  // Match both single and double quotes, case-insensitive
  const pattern = new RegExp(
    `<meta\\s[^>]*${attribute}\\s*=\\s*["']${nameOrProperty}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match?.[1]) return match[1].trim();

  // Also try reversed attribute order (content first, then name/property)
  const patternReversed = new RegExp(
    `<meta\\s[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attribute}\\s*=\\s*["']${nameOrProperty}["']`,
    "i",
  );
  const matchReversed = html.match(patternReversed);
  return matchReversed?.[1]?.trim();
}

/**
 * Extract all OG tag meta properties.
 */
function extractOgTags(html: string): Record<string, string> {
  const ogTags: Record<string, string> = {};
  const pattern =
    /<meta\s[^>]*property\s*=\s*["'](og:[^"']+)["'][^>]*content\s*=\s*["']([^"']*)["']/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    if (match[1] && match[2] !== undefined) {
      ogTags[match[1].toLowerCase()] = match[2];
    }
  }

  // Also try reversed attribute order
  const patternReversed =
    /<meta\s[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["'](og:[^"']+)["']/gi;
  while ((match = patternReversed.exec(html)) !== null) {
    if (match[2] && match[1] !== undefined) {
      const key = match[2].toLowerCase();
      if (!ogTags[key]) {
        ogTags[key] = match[1];
      }
    }
  }

  return ogTags;
}

/**
 * Extract heading structure from HTML (first 20 headings).
 */
function extractHeadings(html: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const pattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && headings.length < 20) {
    const levelStr = match[1];
    if (!levelStr) continue;
    const level = parseInt(levelStr, 10) as 1 | 2 | 3 | 4 | 5 | 6;
    const rawText = match[2] ?? "";
    const text = rawText
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      headings.push({ level, text });
    }
  }

  return headings;
}

/**
 * Extract all JSON-LD structured data blocks.
 */
function extractStructuredData(html: string): StructuredDataItem[] {
  const items: StructuredDataItem[] = [];
  const pattern =
    /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const jsonStr = match[1]?.trim();
    if (!jsonStr) continue;
    try {
      const data = JSON.parse(jsonStr) as Record<string, unknown>;
      const type =
        typeof data["@type"] === "string"
          ? data["@type"]
          : Array.isArray(data["@type"])
            ? (data["@type"] as string[]).join(",")
            : "Unknown";
      items.push({ type, data });
    } catch {
      // Skip malformed JSON-LD
    }
  }

  return items;
}

/**
 * Run the SEO diagnostic agent on a crawled page.
 */
export async function runSeoAgent(crawl: CrawlResult): Promise<SeoResult> {
  const { html, url } = crawl;

  // Extract title
  const title = extractTagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  // Extract meta description
  const metaDescription = extractMetaContent(html, "description", "name");

  // Extract OG tags
  const ogTags = extractOgTags(html);

  // Extract canonical URL
  const canonicalMatch = html.match(
    /<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i,
  );
  const canonicalReversed = !canonicalMatch
    ? html.match(
        /<link\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i,
      )
    : null;
  const canonicalUrl =
    canonicalMatch?.[1]?.trim() ?? canonicalReversed?.[1]?.trim();

  // Extract heading structure
  const headings = extractHeadings(html);

  // Extract robots meta
  const robotsMeta = extractMetaContent(html, "robots", "name");

  // Check robots.txt
  let hasRobotsTxt = false;
  let hasSitemap = false;
  let robotsTxtContent = "";

  try {
    const origin = new URL(url).origin;
    const robotsResponse = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MeshDiagnostic/1.0; +https://decocms.com)",
      },
    });
    if (robotsResponse.ok) {
      robotsTxtContent = await robotsResponse.text();
      hasRobotsTxt = robotsTxtContent.trim().length > 0;
    }
  } catch {
    // robots.txt not accessible — hasRobotsTxt stays false
  }

  // Check sitemap — first look in robots.txt, then try /sitemap.xml
  if (hasRobotsTxt && /^Sitemap:/im.test(robotsTxtContent)) {
    hasSitemap = true;
  } else {
    try {
      const origin = new URL(url).origin;
      const sitemapResponse = await fetch(`${origin}/sitemap.xml`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MeshDiagnostic/1.0; +https://decocms.com)",
        },
      });
      hasSitemap =
        sitemapResponse.ok && (await sitemapResponse.text()).trim().length > 0;
    } catch {
      // Sitemap not accessible — hasSitemap stays false
    }
  }

  // Extract structured data
  const structuredData = extractStructuredData(html);

  return {
    title,
    metaDescription,
    ogTags,
    canonicalUrl,
    headings,
    robotsMeta,
    hasRobotsTxt,
    hasSitemap,
    structuredData,
  };
}
