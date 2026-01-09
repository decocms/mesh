/**
 * Utilities for extracting and formatting MCP Server names
 */

/**
 * Extracts the display name from an MCP Server name in reverse domain format.
 *
 * Examples:
 * - "ai.zine/mcp" -> "zine"
 * - "com.apple-rag/mcp-server" -> "apple-rag"
 * - "simple-name" -> "simple-name"
 * - "io.modelcontextprotocol.registry/github" -> "github"
 *
 * @param fullName - The full MCP Server name (may be in domain/server format)
 * @returns The formatted name for display
 */
export function extractDisplayNameFromDomain(fullName: string): string {
  // If no "/" is present, return as is
  if (!fullName.includes("/")) {
    return fullName;
  }

  const parts = fullName.split("/");
  const domain = parts[0];
  const serverName = parts[1];

  // If unable to extract parts, return original
  if (!domain || !serverName) {
    return fullName;
  }

  // If domain has dots (reverse domain format), extract the last part
  if (domain.includes(".")) {
    const domainParts = domain.split(".");
    const lastDomainPart = domainParts[domainParts.length - 1] || domain;

    // Remove common suffixes like "mcp" or "mcp-server" from serverName
    const cleanServerName = serverName
      .replace(/^mcp-?/, "")
      .replace(/-?mcp$/, "")
      .replace(/^server-?/, "")
      .replace(/-?server$/, "");

    // If after cleaning the serverName is empty or too short, use the last domain part
    if (!cleanServerName || cleanServerName.length < 2) {
      return lastDomainPart;
    }

    return cleanServerName;
  }

  // If domain has no dots, return serverName
  return serverName;
}
