/**
 * Resource Loader for MCP Apps
 *
 * Fetches UI resources from MCP servers and caches them for reuse.
 * Resources are fetched via the MCP resources/read method.
 */

import { MCP_APP_MIME_TYPE, isUIResourceUri } from "./types.ts";

/**
 * Result of loading a UI resource
 */
export interface UIResourceContent {
  /** The HTML content of the resource */
  html: string;
  /** The MIME type of the resource */
  mimeType: string;
  /** The URI of the resource */
  uri: string;
}

/**
 * Error thrown when a UI resource cannot be loaded
 */
export class UIResourceLoadError extends Error {
  constructor(
    public readonly uri: string,
    public readonly reason: string,
    public override readonly cause?: unknown,
  ) {
    super(`Failed to load UI resource ${uri}: ${reason}`, { cause });
    this.name = "UIResourceLoadError";
  }
}

/**
 * Options for the resource loader
 */
export interface ResourceLoaderOptions {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
  /** Maximum cache size (number of entries, default: 100) */
  maxCacheSize?: number;
}

/**
 * Cache entry for a UI resource
 */
interface CacheEntry {
  content: UIResourceContent;
  timestamp: number;
}

/**
 * Check if we're in development mode
 * In dev mode, caching is disabled to allow hot reloading of MCP App UIs
 */
const isDev =
  typeof import.meta !== "undefined" &&
  "env" in import.meta &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * UI Resource Loader
 *
 * Loads and caches UI resources from MCP servers.
 * Caching is disabled in development mode to allow hot reloading.
 */
export class UIResourceLoader {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number;
  private maxCacheSize: number;

  constructor(options: ResourceLoaderOptions = {}) {
    // Disable caching in dev mode for hot reloading
    this.cacheTTL = isDev ? 0 : (options.cacheTTL ?? 5 * 60 * 1000); // 5 minutes in prod
    this.maxCacheSize = options.maxCacheSize ?? 100;
  }

  /**
   * Load a UI resource
   *
   * @param uri - The URI of the resource to load
   * @param readResource - Function to read a resource from the MCP server
   * @returns The loaded resource content
   */
  async load(
    uri: string,
    readResource: (uri: string) => Promise<{
      contents: Array<{
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      }>;
    }>,
  ): Promise<UIResourceContent> {
    // Validate URI
    if (!isUIResourceUri(uri)) {
      throw new UIResourceLoadError(
        uri,
        "Not a UI resource URI (must start with ui://)",
      );
    }

    // Check cache
    const cached = this.getFromCache(uri);
    if (cached) {
      return cached;
    }

    // Load from server
    try {
      const result = await readResource(uri);

      if (!result.contents || result.contents.length === 0) {
        throw new UIResourceLoadError(uri, "Resource returned no contents");
      }

      const content = result.contents[0]!;

      // Extract text content
      let html: string;
      if (content.text) {
        html = content.text;
      } else if (content.blob) {
        // Decode base64 blob
        html = atob(content.blob);
      } else {
        throw new UIResourceLoadError(
          uri,
          "Resource has no text or blob content",
        );
      }

      // Validate MIME type (warn but don't fail)
      const mimeType = content.mimeType ?? "text/html";
      if (mimeType !== MCP_APP_MIME_TYPE && !mimeType.startsWith("text/html")) {
        console.warn(
          `UI resource ${uri} has unexpected MIME type: ${mimeType} (expected ${MCP_APP_MIME_TYPE})`,
        );
      }

      const resourceContent: UIResourceContent = {
        html,
        mimeType,
        uri: content.uri ?? uri,
      };

      // Cache the result
      this.addToCache(uri, resourceContent);

      return resourceContent;
    } catch (error) {
      if (error instanceof UIResourceLoadError) {
        throw error;
      }
      throw new UIResourceLoadError(uri, "Failed to read resource", error);
    }
  }

  /**
   * Get a resource from cache if it exists and is not expired
   */
  private getFromCache(uri: string): UIResourceContent | null {
    const entry = this.cache.get(uri);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(uri);
      return null;
    }

    return entry.content;
  }

  /**
   * Add a resource to the cache
   */
  private addToCache(uri: string, content: UIResourceContent): void {
    // Skip caching if maxCacheSize is 0 or negative
    if (this.maxCacheSize <= 0) {
      return;
    }

    // Evict oldest entries if cache is full
    while (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(uri, {
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate a specific resource in the cache
   */
  invalidate(uri: string): void {
    this.cache.delete(uri);
  }
}

/**
 * Singleton resource loader instance
 */
let defaultLoader: UIResourceLoader | null = null;

/**
 * Get the default resource loader instance
 */
export function getDefaultResourceLoader(): UIResourceLoader {
  if (!defaultLoader) {
    defaultLoader = new UIResourceLoader();
  }
  return defaultLoader;
}
