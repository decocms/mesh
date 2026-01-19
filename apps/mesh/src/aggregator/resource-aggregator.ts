/**
 * ResourceAggregator
 *
 * Lazy-loading aggregator for aggregating resources from multiple connections
 */

import {
  ErrorCode,
  McpError,
  type ListResourcesResult,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../common";
import type { ProxyCollection } from "./proxy-collection";
import type { ToolSelectionMode } from "../storage/types";

/** Cached data structure */
interface ResourceCache {
  resources: Resource[];
  mappings: Map<string, string>; // uri -> connectionId
}

/** Options for ResourceAggregator */
export interface ResourceAggregatorOptions {
  selectionMode: ToolSelectionMode;
}

/**
 * Check if a URI matches a pattern
 * Supports:
 * - Exact match: "file:///path/to/file.txt"
 * - Single segment wildcard (*): "file:///path/*.txt" matches "file:///path/foo.txt"
 * - Multi-segment wildcard (**): "file:///**" matches any path under file://
 */
function matchesPattern(uri: string, pattern: string): boolean {
  // Exact match
  if (uri === pattern) return true;

  // Check if pattern contains wildcards
  if (!pattern.includes("*")) return false;

  // Convert pattern to regex
  // Escape special regex chars except * and **
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*\*/g, "<<<DOUBLE_STAR>>>") // Protect **
    .replace(/\*/g, "[^/]*") // Single * matches any non-/ sequence
    .replace(/<<<DOUBLE_STAR>>>/g, ".*"); // ** matches anything

  // Add anchors for full match
  regexPattern = `^${regexPattern}$`;

  try {
    return new RegExp(regexPattern).test(uri);
  } catch {
    return false;
  }
}

/**
 * Check if a URI matches any of the patterns (or is an exact match)
 */
function matchesAnyPattern(uri: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(uri, pattern));
}

/**
 * Aggregator for aggregating and routing resources from multiple connections
 *
 * Resources are loaded lazily on first access and cached for subsequent calls.
 * Resource URIs are globally unique and used for routing to the correct connection.
 * Uses lazy() to ensure concurrent calls share the same loading promise.
 */
export class ResourceAggregator {
  private cache: Promise<ResourceCache>;

  constructor(
    private proxies: ProxyCollection,
    private options: ResourceAggregatorOptions,
  ) {
    // Create lazy cache - only loads when first awaited
    this.cache = lazy(() => this.loadResources());
  }

  /**
   * Load resources from all connections
   */
  private async loadResources(): Promise<ResourceCache> {
    // Fetch resources from all connections in parallel
    const results = await this.proxies.mapSettled(
      async (entry, connectionId) => {
        try {
          const result = await entry.proxy.client.listResources();
          let resources = result.resources;

          // Apply selection based on mode
          if (this.options.selectionMode === "exclusion") {
            // Exclusion mode: exclude matching resources
            if (entry.selectedResources && entry.selectedResources.length > 0) {
              resources = resources.filter(
                (r) => !matchesAnyPattern(r.uri, entry.selectedResources!),
              );
            }
            // If selectedResources is null/empty in exclusion mode, include all resources
          } else {
            // Inclusion mode: include only selected resources
            // Resources require explicit selection (patterns or URIs)
            if (
              !entry.selectedResources ||
              entry.selectedResources.length === 0
            ) {
              // No resources selected = no resources from this connection
              resources = [];
            } else {
              resources = resources.filter((r) =>
                matchesAnyPattern(r.uri, entry.selectedResources!),
              );
            }
          }

          return { connectionId, resources };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[aggregator] Failed to list resources for connection ${connectionId}: (defaulting to empty array)`,
              error,
            );
          }
          return { connectionId, resources: [] as Resource[] };
        }
      },
    );

    // Build resource URI -> connection mapping (first-wins deduplication)
    const seenUris = new Set<string>();
    const allResources: Resource[] = [];
    const mappings = new Map<string, string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { connectionId, resources } = result.value;
      for (const resource of resources) {
        if (seenUris.has(resource.uri)) continue;
        seenUris.add(resource.uri);

        allResources.push(resource);
        mappings.set(resource.uri, connectionId);
      }
    }

    return { resources: allResources, mappings };
  }

  /**
   * List all aggregated resources
   */
  async list(): Promise<ListResourcesResult> {
    const cache = await this.cache;
    return { resources: cache.resources };
  }

  /**
   * Read a resource by URI, routing to the correct connection
   */
  async read(
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> {
    const cache = await this.cache;

    const connectionId = cache.mappings.get(params.uri);
    if (!connectionId) {
      throw new Error(`Resource not found: ${params.uri}`);
    }

    const proxyEntry = this.proxies.get(connectionId);
    if (!proxyEntry) {
      throw new Error(`Connection not found for resource: ${params.uri}`);
    }

    return await proxyEntry.proxy.client.readResource(params);
  }
}
