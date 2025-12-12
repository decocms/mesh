/**
 * Shared utilities for registry operations
 * Centralizes duplicated logic across store-related files
 */

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
