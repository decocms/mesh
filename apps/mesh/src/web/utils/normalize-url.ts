/**
 * Normalizes MCP connection URLs by removing the `/i:` prefix from UUIDs
 * @param url - The URL to normalize
 * @returns The normalized URL string
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\/i:([a-f0-9-]+)/gi, "/$1");
    return parsed.toString();
  } catch {
    return url;
  }
}
