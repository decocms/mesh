/**
 * Client Pool
 *
 * Manages a pool of MCP clients using a Map for connection reuse.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface ClientPoolOptions {
  /**
   * Called when a client is evicted from the pool (close, error, or dispose).
   * Use this to clean up associated resources (e.g., shared headers).
   */
  onEvict?: (key: string) => void;
}

/**
 * Create a client pool
 * Returns a function to get or create clients from the pool
 *
 * @returns Function to get or create a client connection from the pool
 */
export function createClientPool(options?: ClientPoolOptions): (<
  T extends Transport,
>(
  transport: T,
  key: string,
) => Promise<Client>) & {
  [Symbol.asyncDispose]: () => Promise<void>;
} {
  // Map to store client promises (single-flight pattern)
  const clientMap = new Map<string, Promise<Client>>();
  const onEvict = options?.onEvict;

  function evict(key: string) {
    clientMap.delete(key);
    onEvict?.(key);
  }

  /**
   * Get or create a client connection from the pool
   * Implements single-flight pattern: concurrent requests for the same key share the same connection promise
   *
   * @param transport - The transport to use for the connection
   * @param key - Unique key for the cache (typically connectionId)
   * @returns The connected client
   */
  function getOrCreateClientImpl<T extends Transport>(
    transport: T,
    key: string,
  ): Promise<Client> {
    // Check cache for existing promise (single-flight pattern)
    const cachedPromise = clientMap.get(key);
    if (cachedPromise) {
      console.log(`[ClientPool] Reusing cached client for ${key}`);
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
      evict(key);
    };

    const clientPromise = client
      .connect(transport, { timeout: 30_000 })
      .then(() => client)
      .catch((e) => {
        evict(key);
        throw e;
      });

    clientMap.set(key, clientPromise);

    return clientPromise;
  }

  // Create the function object with Symbol.asyncDispose
  const getOrCreateClient = Object.assign(getOrCreateClientImpl, {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      const closePromises: Promise<void>[] = [];
      for (const [key, clientPromise] of clientMap) {
        closePromises.push(
          clientPromise
            .then((client) => client.close())
            .catch((err) =>
              console.error(`[ClientPool] Error closing client ${key}:`, err),
            ),
        );
      }
      await Promise.all(closePromises);
      clientMap.clear();
    },
  }) as (<T extends Transport>(
    transport: T,
    key: string,
  ) => Promise<Client>) & {
    [Symbol.asyncDispose]: () => Promise<void>;
  };

  return getOrCreateClient;
}
