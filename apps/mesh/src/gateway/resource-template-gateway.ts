/**
 * ResourceTemplateGateway
 *
 * Lazy-loading gateway for aggregating resource templates from multiple connections
 */

import {
  ErrorCode,
  McpError,
  type ListResourceTemplatesResult,
  type ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../common";
import type { ProxyCollection } from "./proxy-collection";

/** Cached data structure */
interface ResourceTemplateCache {
  templates: ResourceTemplate[];
}

/**
 * Gateway for aggregating resource templates from multiple connections
 *
 * Resource templates are loaded lazily on first access and cached for subsequent calls.
 * Uses lazy() to ensure concurrent calls share the same loading promise.
 */
export class ResourceTemplateGateway {
  private cache: Promise<ResourceTemplateCache>;

  constructor(private proxies: ProxyCollection) {
    // Create lazy cache - only loads when first awaited
    this.cache = lazy(() => this.loadResourceTemplates());
  }

  /**
   * Load resource templates from all connections
   */
  private async loadResourceTemplates(): Promise<ResourceTemplateCache> {
    // Fetch resource templates from all connections in parallel
    const results = await this.proxies.mapSettled(
      async (entry, connectionId) => {
        try {
          const result = await entry.proxy.client.listResourceTemplates();
          return { connectionId, templates: result.resourceTemplates };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[gateway] Failed to list resource templates for connection ${connectionId}: (defaulting to empty array)`,
              error,
            );
          }
          return { connectionId, templates: [] as ResourceTemplate[] };
        }
      },
    );

    // Aggregate all resource templates
    const allTemplates: ResourceTemplate[] = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { templates } = result.value;
      for (const template of templates) {
        allTemplates.push(template);
      }
    }

    return { templates: allTemplates };
  }

  /**
   * List all aggregated resource templates
   */
  async list(): Promise<ListResourceTemplatesResult> {
    const cache = await this.cache;
    return { resourceTemplates: cache.templates };
  }
}
