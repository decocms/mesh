/**
 * ResourceGateway
 *
 * Lazy-loading gateway for aggregating resources from multiple connections
 */

import type {
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../common";
import type { ProxyCollection } from "./proxy-collection";

/** Cached data structure */
interface ResourceCache {
  resources: Resource[];
  mappings: Map<string, string>; // uri -> connectionId
}

/**
 * Gateway for aggregating and routing resources from multiple connections
 *
 * Resources are loaded lazily on first access and cached for subsequent calls.
 * Resource URIs are globally unique and used for routing to the correct connection.
 * Uses lazy() to ensure concurrent calls share the same loading promise.
 */
export class ResourceGateway {
  private cache: Promise<ResourceCache>;

  constructor(private proxies: ProxyCollection) {
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
          return { connectionId, resources: result.resources };
        } catch (error) {
          console.error(
            `[gateway] Failed to list resources for connection ${connectionId}:`,
            error,
          );
          return { connectionId, resources: [] as Resource[] };
        }
      },
    );

    // Build resource URI -> connection mapping (URIs are globally unique)
    const allResources: Resource[] = [];
    const mappings = new Map<string, string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { connectionId, resources } = result.value;
      for (const resource of resources) {
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
