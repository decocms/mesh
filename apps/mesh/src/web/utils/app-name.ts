/**
 * Utilities for extracting and formatting MCP app names
 */

/**
 * Extracts the display name from an app name in reverse domain format.
 *
 * Examples:
 * - "ai.zine/mcp" -> "zine"
 * - "com.apple-rag/mcp-server" -> "apple-rag"
 * - "simple-name" -> "simple-name"
 * - "io.modelcontextprotocol.registry/github" -> "github"
 *
 * @param fullName - The full app name (may be in domain/app format)
 * @returns The formatted name for display
 */
export function extractDisplayNameFromDomain(fullName: string): string {
  // If no "/" is present, return as is
  if (!fullName.includes("/")) {
    return fullName;
  }

  const parts = fullName.split("/");
  const domain = parts[0];
  const appName = parts[1];

  // If unable to extract parts, return original
  if (!domain || !appName) {
    return fullName;
  }

  // If domain has dots (reverse domain format), extract the last part
  if (domain.includes(".")) {
    const domainParts = domain.split(".");
    const lastDomainPart = domainParts[domainParts.length - 1] || domain;

    // Remove common suffixes like "mcp" or "mcp-server" from appName
    const cleanAppName = appName
      .replace(/^mcp-?/, "")
      .replace(/-?mcp$/, "")
      .replace(/^server-?/, "")
      .replace(/-?server$/, "");

    // If after cleaning the appName is empty or too short, use the last domain part
    if (!cleanAppName || cleanAppName.length < 2) {
      return lastDomainPart;
    }

    return cleanAppName;
  }

  // If domain has no dots, return appName
  return appName;
}
