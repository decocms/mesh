/**
 * Client Pool
 *
 * Manages a pool of MCP clients using an LRU cache for connection reuse.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * LRU Cache implementation using Map for connection pooling
 * Stores promises to implement single-flight pattern (prevent duplicate connections)
 */
class LRUCache {
  private cache: Map<string, Promise<Client>>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): Promise<Client> | undefined {
    const promise = this.cache.get(key);
    if (promise) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, promise);
    }
    return promise;
  }

  set(key: string, value: Promise<Client>): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first entry)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

// Module-level LRU cache instance
const lruCache = new LRUCache(100);

/**
 * Get or create a client connection from the LRU pool
 * Implements single-flight pattern: concurrent requests for the same key share the same connection promise
 *
 * @param transport - The transport to use for the connection
 * @param key - Unique key for the LRU cache (typically connectionId)
 * @returns The connected client
 */
export function getOrCreateClient<T extends Transport>(
  transport: T,
  key: string,
): Promise<Client> {
  // Check LRU cache for existing promise (single-flight pattern)
  const cachedPromise = lruCache.get(key);
  if (cachedPromise) {
    return cachedPromise;
  }

  // Create the connection promise immediately and store it
  // This ensures concurrent requests for the same key get the same promise
  const client = new Client(
    {
      name: `outbound-client-${key}`,
      version: "1.0.0",
    },
    {
      capabilities: {
        tasks: {
          list: {},
          cancel: {},
          requests: { tool: { call: {} } },
        },
      },
    },
  );

  // Set up cleanup handler BEFORE connecting - remove from cache when connection closes
  client.onclose = () => {
    lruCache.delete(key);
  };

  const clientPromise = client
    .connect(transport, { timeout: 30_000 })
    .then(() => client)
    .catch((e) => {
      lruCache.delete(key);
      throw e;
    });

  lruCache.set(key, clientPromise);

  return clientPromise;
}
