/**
 * Stable Stdio Client Transport
 *
 * Wraps StdioClientTransport to provide a stable local MCP connection:
 * - Does NOT close the connection when close() is called (keeps process alive)
 * - Automatically respawns the process if it dies unexpectedly
 *
 * This is important for local MCP servers (npx packages) where we want to
 * avoid the overhead of spawning a new process for every request.
 *
 * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/stdio.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";

export interface StableStdioConfig extends StdioServerParameters {
  /** Unique ID for this connection (for logging) */
  id: string;
  /** Human-readable name for the MCP (for logging) */
  name?: string;
}

/**
 * Stable client wrapper that ignores close() calls.
 * This ensures the underlying connection stays alive across requests.
 */
interface StableClient extends Client {
  /** The actual client (for internal use) */
  __actualClient: Client;
}

interface StableConnection {
  transport: StdioClientTransport;
  client: Client;
  stableClient: StableClient;
  config: StableStdioConfig;
  status: "connecting" | "connected" | "reconnecting" | "failed";
  connectPromise: Promise<StableClient> | null;
}

/**
 * Create a stable client wrapper that ignores close() calls
 */
function createStableClientWrapper(client: Client): StableClient {
  // Create a proxy that intercepts close() and does nothing
  const stableClient = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "close") {
        // Return a no-op function that resolves immediately
        return async () => {
          // Do nothing - stable connections should NOT be closed
        };
      }
      if (prop === "__actualClient") {
        return target;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as StableClient;

  return stableClient;
}

/**
 * Pool of stable stdio connections
 * Uses globalThis to survive HMR reloads
 */
const GLOBAL_KEY = "__mesh_stable_stdio_pool__";

declare global {
  var __mesh_stable_stdio_pool__: Map<string, StableConnection> | undefined;
  var __mesh_stable_stdio_shutdown_registered__: boolean | undefined;
}

const connectionPool: Map<string, StableConnection> =
  globalThis[GLOBAL_KEY] ?? (globalThis[GLOBAL_KEY] = new Map());

/**
 * Get or create a stable stdio connection
 *
 * - If connection exists and is connected, returns existing client
 * - If connection is reconnecting, waits for reconnection
 * - If connection doesn't exist, creates new one
 * - If connection died, respawns it
 *
 * The returned client has close() disabled - call forceCloseStdioConnection() for explicit shutdown.
 */
export async function getStableStdioClient(
  config: StableStdioConfig,
): Promise<Client> {
  const existing = connectionPool.get(config.id);

  // If we have an existing connection that's connected, return the stable wrapper
  if (existing?.status === "connected" && existing.stableClient) {
    return existing.stableClient;
  }

  // If we're already connecting/reconnecting, wait for that
  if (
    existing?.connectPromise &&
    (existing.status === "connecting" || existing.status === "reconnecting")
  ) {
    return existing.connectPromise;
  }

  // Create new connection or respawn
  const isRespawn = existing?.status === "failed";
  const connection: StableConnection = existing ?? {
    transport: null as unknown as StdioClientTransport,
    client: null as unknown as Client,
    stableClient: null as unknown as StableClient,
    config,
    status: "connecting",
    connectPromise: null,
  };

  if (!existing) {
    connectionPool.set(config.id, connection);
  }

  connection.status = isRespawn ? "reconnecting" : "connecting";

  // Create the connection promise
  connection.connectPromise = (async () => {
    try {
      console.log(
        `[StableStdio] ${isRespawn ? "Respawning" : "Spawning"}: ${config.id} (${config.command} ${config.args?.join(" ") ?? ""})`,
      );

      // Create transport - SDK handles spawning and merges env with getDefaultEnvironment()
      // We only pass the additional env vars we need (like API tokens)
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
        stderr: "pipe", // Capture stderr for debugging
      });

      connection.transport = transport;

      // Create client
      const client = new Client({
        name: `mesh-stdio-${config.id}`,
        version: "1.0.0",
      });

      connection.client = client;

      // Create stable wrapper that ignores close() calls
      connection.stableClient = createStableClientWrapper(client);

      // Handle unexpected close - mark for respawn
      // We want stable local MCP connection - respawn on close
      client.onclose = () => {
        console.log(
          `[StableStdio] Connection closed unexpectedly: ${config.id}`,
        );
        connection.status = "failed";
        connection.connectPromise = null;
        // Don't remove from pool - next request will respawn
      };

      // Handle stderr for debugging - pass through MCP logs with subtle connection reference
      const label = config.name || config.id;
      const dim = "\x1b[2m";
      const reset = "\x1b[0m";
      transport.stderr?.on("data", (data: Buffer) => {
        const output = data.toString().trimEnd();
        if (output) {
          // Print MCP output first, then subtle connection reference
          console.error(`${output} ${dim}[${label}]${reset}`);
        }
      });

      // Connect with timeout - use AbortController to clean up on success
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      try {
        await Promise.race([
          client.connect(transport),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(new Error("Stdio connection timeout after 30s"));
            });
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      connection.status = "connected";
      console.log(`[StableStdio] Connected: ${config.id}`);

      // Return the stable wrapper (close() is disabled)
      return connection.stableClient;
    } catch (error) {
      console.error(`[StableStdio] Failed to connect ${config.id}:`, error);
      connection.status = "failed";
      connection.connectPromise = null;

      // Clean up the spawned transport process to avoid orphaned processes
      try {
        await connection.transport?.close();
      } catch {
        // Ignore close errors during cleanup
      }

      throw error;
    }
  })();

  return connection.connectPromise;
}

/**
 * Force close a stable stdio connection
 * Used for explicit shutdown (e.g., server shutdown)
 */
async function forceCloseStdioConnection(id: string): Promise<void> {
  const connection = connectionPool.get(id);
  if (!connection) return;

  console.log(`[StableStdio] Force closing: ${id}`);

  try {
    // Remove onclose handler to prevent respawn
    if (connection.client) {
      connection.client.onclose = undefined;
    }
    await connection.client?.close();
  } catch {
    // Ignore close errors
  }

  connectionPool.delete(id);
}

/**
 * Force close all stable stdio connections
 * Called during server shutdown via SIGINT/SIGTERM handlers
 */
async function forceCloseAllStdioConnections(): Promise<void> {
  console.log(`[StableStdio] Closing all connections (${connectionPool.size})`);

  const closePromises = Array.from(connectionPool.keys()).map((id) =>
    forceCloseStdioConnection(id),
  );

  await Promise.allSettled(closePromises);
  connectionPool.clear();
}

// Register shutdown handlers - clean up connections before exit
// Use globalThis to survive HMR reloads (same pattern as connectionPool)
const SHUTDOWN_KEY = "__mesh_stable_stdio_shutdown_registered__";

if (!globalThis[SHUTDOWN_KEY]) {
  globalThis[SHUTDOWN_KEY] = true;

  const cleanup = async (signal: string) => {
    await forceCloseAllStdioConnections();
    // Re-raise signal after cleanup so process exits properly
    process.exit(signal === "SIGINT" ? 130 : 143); // 128 + signal number
  };

  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
}
