/**
 * Query key factory for store plugin
 *
 * All query keys used by the store plugin for React Query caching.
 */

export const STORE_KEYS = {
  /**
   * Key for tool call queries
   */
  toolCall: (connectionId: string, toolName: string, paramsKey: string) =>
    ["store", "toolCall", connectionId, toolName, paramsKey] as const,

  /**
   * Key for store discovery queries (infinite query)
   */
  discovery: (connectionId: string, filterParams: string) =>
    ["store", "discovery", connectionId, filterParams] as const,

  /**
   * Key for registry filters
   */
  filters: (connectionId: string) =>
    ["store", "filters", connectionId] as const,

  /**
   * Key for GitHub readme queries
   */
  githubReadme: (owner?: string, repo?: string) =>
    ["store", "github", "readme", owner, repo] as const,
} as const;

// Alias for backward compatibility
export const KEYS = STORE_KEYS;
