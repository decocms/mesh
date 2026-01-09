/**
 * Store Plugin Utilities
 *
 * Shared utilities for registry operations and string manipulation.
 */

// ----------------------------------
// GitHub avatar utilities (re-exported from @deco/ui)
// ----------------------------------
export {
  extractGitHubRepo,
  getGitHubAvatarUrl,
} from "@deco/ui/lib/github.ts";

// ----------------------------------
// MCP Server name utilities
// ----------------------------------

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

// ----------------------------------
// Registry utilities
// ----------------------------------

/**
 * Find the LIST tool from a tools array
 * Returns the tool name if found, empty string otherwise
 */
export function findListToolName(
  tools?: Array<{ name: string }> | null,
): string {
  if (!tools) return "";
  const listTool = tools.find((tool) => tool.name.endsWith("_LIST"));
  return listTool?.name ?? "";
}

/**
 * Find the FILTERS tool from a tools array
 * Returns the tool name if found, empty string otherwise
 * Note: Not all registries support filters
 */
export function findFiltersToolName(
  tools?: Array<{ name: string }> | null,
): string {
  if (!tools) return "";
  const filtersTool = tools.find((tool) => tool.name.endsWith("_FILTERS"));
  return filtersTool?.name ?? "";
}

/**
 * Flatten paginated items from multiple pages into a single array
 * Handles both direct array responses and nested array responses
 */
export function flattenPaginatedItems<T>(pages?: unknown[]): T[] {
  if (!pages) return [];

  const items: T[] = [];

  for (const page of pages) {
    let pageItems: T[] = [];

    if (Array.isArray(page)) {
      pageItems = page;
    } else if (typeof page === "object" && page !== null) {
      const itemsKey = Object.keys(page).find((key) =>
        Array.isArray(page[key as keyof typeof page]),
      );
      if (itemsKey) {
        pageItems = page[itemsKey as keyof typeof page] as T[];
      }
    }

    items.push(...pageItems);
  }

  return items;
}

/**
 * Map remote connection types to human-readable labels
 */
const CONNECTION_TYPE_MAP: Record<string, string> = {
  "streamable-http": "HTTP",
  http: "HTTP",
  sse: "SSE",
  stdio: "STDIO",
  websocket: "Websocket",
};

/**
 * Get human-readable label for a connection type
 * Returns uppercase version if type not in map, or null if no type provided
 */
export function getConnectionTypeLabel(remoteType?: string): string | null {
  if (!remoteType) return null;
  return CONNECTION_TYPE_MAP[remoteType] ?? remoteType.toUpperCase();
}

/**
 * Extract schema version from a schema URL
 * Example: "https://schemas/2024-11-21" -> "2024-11-21"
 */
export function extractSchemaVersion(schemaUrl?: string): string | null {
  if (!schemaUrl) return null;
  const match = schemaUrl.match(/schemas\/([\d-]+)/);
  return match?.[1] ?? null;
}

/**
 * Extract items array from various response formats
 * Handles both direct array responses and nested array responses
 */
export function extractItemsFromResponse<T>(response: unknown): T[] {
  if (!response) return [];

  // Direct array response
  if (Array.isArray(response)) {
    return response;
  }

  // Object with nested array
  if (typeof response === "object" && response !== null) {
    const itemsKey = Object.keys(response).find((key) =>
      Array.isArray(response[key as keyof typeof response]),
    );

    if (itemsKey) {
      return response[itemsKey as keyof typeof response] as T[];
    }
  }

  return [];
}

/**
 * Convert a string to a URL-friendly slug
 * Removes special characters, converts to lowercase, and replaces spaces with hyphens
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\//g, "-") // Replace forward slashes with hyphens
    .replace(/[^a-z0-9\s_-]+/g, "") // Remove special characters except word chars, spaces, underscores, and hyphens
    .replace(/[\s_-]+/g, "-") // Replace spaces, underscores, and hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading and trailing hyphens
}
