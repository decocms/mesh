/**
 * ProxyCollection
 *
 * Holds connection proxies and provides iteration/lookup capabilities
 */

import type { MeshContext } from "../core/mesh-context";
import type { ConnectionEntity } from "../tools/connection/schema";
import type { ProxyEntry } from "./types";

/**
 * Collection of MCP proxies for aggregator connections
 *
 * Manages the creation and lookup of proxies for downstream connections
 */
export class ProxyCollection {
  private proxies = new Map<string, ProxyEntry>();

  private constructor() {}

  /**
   * Create a ProxyCollection from connection configurations
   *
   * Creates proxies for all connections in parallel, filtering out failures
   */
  static async create(
    connections: Array<{
      connection: ConnectionEntity;
      selectedTools: string[] | null;
      selectedResources: string[] | null;
      selectedPrompts: string[] | null;
    }>,
    ctx: MeshContext,
  ): Promise<ProxyCollection> {
    const collection = new ProxyCollection();

    const proxyResults = await Promise.allSettled(
      connections.map(
        async ({
          connection,
          selectedTools,
          selectedResources,
          selectedPrompts,
        }) => {
          try {
            const proxy = await ctx.createMCPProxy(connection);
            return {
              connection,
              proxy,
              selectedTools,
              selectedResources,
              selectedPrompts,
            };
          } catch (error) {
            console.error(
              `[aggregator] Failed to create proxy for connection ${connection.id}:`,
              error,
            );
            return null;
          }
        },
      ),
    );

    for (const result of proxyResults) {
      if (result.status === "fulfilled" && result.value) {
        collection.proxies.set(result.value.connection.id, result.value);
      }
    }

    return collection;
  }

  /**
   * Get a proxy entry by connection ID
   */
  get(connectionId: string): ProxyEntry | undefined {
    return this.proxies.get(connectionId);
  }

  /**
   * Iterate over all proxy entries
   */
  entries(): IterableIterator<[string, ProxyEntry]> {
    return this.proxies.entries();
  }

  /**
   * Execute a function for each proxy entry
   */
  forEach(fn: (entry: ProxyEntry, connectionId: string) => void): void {
    this.proxies.forEach((entry, id) => fn(entry, id));
  }

  /**
   * Map over all proxy entries and collect results
   */
  async mapAsync<T>(
    fn: (entry: ProxyEntry, connectionId: string) => Promise<T>,
  ): Promise<T[]> {
    const results: Promise<T>[] = [];
    for (const [id, entry] of this.proxies.entries()) {
      results.push(fn(entry, id));
    }
    return await Promise.all(results);
  }

  /**
   * Map over all proxy entries in parallel with error handling
   */
  async mapSettled<T>(
    fn: (entry: ProxyEntry, connectionId: string) => Promise<T>,
  ): Promise<PromiseSettledResult<T>[]> {
    return Promise.allSettled(
      Array.from(this.proxies.entries()).map(([id, entry]) => fn(entry, id)),
    );
  }

  /**
   * Get the number of proxies in the collection
   */
  get size(): number {
    return this.proxies.size;
  }
}
