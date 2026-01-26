/**
 * Client Pool
 *
 * Manages a pool of MCP clients using an LRU cache for connection reuse.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * LRU Cache implementation using Map for connection pooling
 */
class LRUCache {
  private cache: Map<string, Client>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): Client | undefined {
    const client = this.cache.get(key);
    if (client) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, client);
    }
    return client;
  }

  set(key: string, value: Client): void {
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
 *
 * @param transport - The transport to use for the connection
 * @param key - Unique key for the LRU cache (typically connectionId)
 * @returns The connected client
 */
export async function getOrCreateClient<T extends Transport>(
  transport: T,
  key: string,
): Promise<Client> {
  // Check LRU cache for existing client
  const cachedClient = lruCache.get(key);
  if (cachedClient) {
    return cachedClient;
  }

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

  await client.connect(transport, { timeout: 30_000 });

  // Add to LRU cache
  lruCache.set(key, client);

  return client;
}
