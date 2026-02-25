/**
 * Shared HTML crawler for diagnostic agents.
 *
 * Used by all 4 diagnostic agents to avoid redundant HTTP requests.
 * Pre-auth code — does NOT use MeshContext.
 */

export interface CrawlResult {
  url: string;
  html: string;
  headers: Record<string, string>;
  statusCode: number;
  redirectedUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; MeshDiagnostic/1.0; +https://decocms.com)";

/**
 * Crawl a single page and return its HTML content, headers, and status code.
 * Throws if the request fails or times out.
 */
export async function crawlPage(
  url: string,
  options?: { timeoutMs?: number },
): Promise<CrawlResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
    });

    const html = await response.text();

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Detect if we were redirected
    const redirectedUrl = response.url !== url ? response.url : undefined;

    return {
      url,
      html,
      headers,
      statusCode: response.status,
      redirectedUrl,
    };
  } catch (error) {
    const err = error as Error;
    if (err.name === "AbortError") {
      throw new Error(
        `[diagnostic:crawl] Timeout after ${timeoutMs}ms fetching ${url}`,
      );
    }
    throw new Error(
      `[diagnostic:crawl] Failed to fetch ${url}: ${err.message}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Crawl multiple pages in parallel, returning only successful results.
 * Failed pages are silently skipped.
 */
export async function crawlMultiplePages(
  urls: string[],
  options?: { timeoutMs?: number; maxPages?: number },
): Promise<CrawlResult[]> {
  const maxPages = options?.maxPages ?? 5;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const urlsToFetch = urls.slice(0, maxPages);
  const results = await Promise.allSettled(
    urlsToFetch.map((url) => crawlPage(url, { timeoutMs })),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<CrawlResult> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}
