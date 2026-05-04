/**
 * Provider-specific helpers for MCP connections.
 * Detects well-known providers that need special handling in the OAuth proxy.
 */

/** Check if a connection URL points to Figma's MCP server */
export function isFigmaConnection(connectionUrl: string | null): boolean {
  if (!connectionUrl) return false;
  try {
    const url = new URL(connectionUrl);
    return url.hostname === "figma.com" || url.hostname.endsWith(".figma.com");
  } catch {
    return false;
  }
}
