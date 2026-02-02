/**
 * Client Pool
 *
 * Manages a pool of MCP clients using a Map for connection reuse.
 * Handles stale connections when MCP servers are restarted.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Check if an error indicates a stale/disconnected server
 * These errors happen when the MCP server process was restarted
 */
function isStaleConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("server not initialized") ||
      message.includes("connection closed") ||
      message.includes("socket hang up") ||
      message.includes("econnreset") ||
      message.includes("econnrefused")
    );
  }
  return false;
}

/**
 * Create a client pool
 * Returns a function to get or create clients from the pool
 *
 * @returns Function to get or create a client connection from the pool
 */
export function createClientPool(): (<T extends Transport>(
  transport: T,
  key: string,
) => Promise<Client>) & {
  invalidate: (key: string) => void;
  [Symbol.asyncDispose]: () => Promise<void>;
} {
  // Map to store client promises (single-flight pattern)
  const clientMap = new Map<string, Promise<Client>>();

  /**
   * Invalidate a cached client, forcing reconnection on next request
   */
  function invalidate(key: string): void {
    const clientPromise = clientMap.get(key);
    if (clientPromise) {
      console.log(`[ClientPool] Invalidating cached client for ${key}`);
      clientMap.delete(key);
      // Close the client in the background
      clientPromise.then((client) => client.close()).catch(() => {}); // Ignore close errors
    }
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
      clientMap.delete(key);
    };

    // Set up error handler to detect stale connections
    client.onerror = (error) => {
      if (isStaleConnectionError(error)) {
        console.log(
          `[ClientPool] Detected stale connection for ${key}, invalidating`,
        );
        clientMap.delete(key);
      }
    };

    const clientPromise = client
      .connect(transport, { timeout: 30_000 })
      .then(() => client)
      .catch((e) => {
        clientMap.delete(key);
        throw e;
      });

    clientMap.set(key, clientPromise);

    return clientPromise;
  }

  // Create the function object with invalidate and Symbol.asyncDispose
  const getOrCreateClient = Object.assign(getOrCreateClientImpl, {
    invalidate,
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
    invalidate: (key: string) => void;
    [Symbol.asyncDispose]: () => Promise<void>;
  };

  return getOrCreateClient;
}
