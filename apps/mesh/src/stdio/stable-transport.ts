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
  /** Process ID for killing the process tree on cleanup */
  pid?: number;
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

  // If we have an existing connection that's connected, verify it's still alive
  if (existing?.status === "connected" && existing.stableClient) {
    try {
      // Quick ping to verify connection is alive (listTools has low overhead)
      await existing.stableClient.listTools();
      return existing.stableClient;
    } catch {
      // Connection is dead, mark for respawn
      console.log(`[StableStdio] Stale connection detected: ${config.id}`);
      existing.status = "failed";
      existing.connectPromise = null;
    }
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

      // Capture PID for process tree cleanup during shutdown
      // The MCP SDK stores the spawned process in _process (private but accessible)
      const transportProcess = (
        transport as unknown as { _process?: { pid?: number } }
      )._process;
      connection.pid = transportProcess?.pid;

      console.log(
        `[StableStdio] Connected: ${config.id} (PID: ${connection.pid ?? "unknown"})`,
      );

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
 * Kill a process tree (parent and all children)
 * This is needed because `bun --watch` spawns child processes
 * that don't get killed when the parent receives SIGTERM
 */
async function killProcessTree(pid: number): Promise<void> {
  try {
    // First, find all child processes
    const { spawn } = await import("child_process");

    // Use pgrep to find children (works on macOS and Linux)
    const pgrep = spawn("pgrep", ["-P", String(pid)]);
    const childPids: number[] = [];

    pgrep.stdout?.on("data", (data: Buffer) => {
      const pids = data
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(Number);
      childPids.push(...pids);
    });

    await new Promise<void>((resolve) => pgrep.on("close", resolve));

    // Recursively kill children first
    for (const childPid of childPids) {
      await killProcessTree(childPid);
    }

    // Kill the process itself with SIGKILL
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process might already be dead
    }
  } catch {
    // Fallback: just try to kill the PID directly
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process might already be dead
    }
  }
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

    // Use the PID we captured when the connection was created
    const pid = connection.pid;

    // First, try graceful close
    try {
      await connection.client?.close();
    } catch {
      // Ignore close errors
    }

    // Then, kill the entire process tree to ensure children are dead
    // This is important for `bun --watch` which spawns child processes
    if (pid) {
      console.log(`[StableStdio] Killing process tree for PID ${pid}`);
      await killProcessTree(pid);
    }
  } catch (error) {
    console.error(`[StableStdio] Error closing connection ${id}:`, error);
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

  // Small delay to ensure OS releases ports after processes are killed
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Kill orphaned STDIO processes that might be left from previous Mesh instances.
 * This handles cases where the connection pool is empty but old processes are still running.
 */
async function killOrphanedStdioProcesses(): Promise<void> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // Patterns for processes spawned by Mesh that might be orphaned
  // These are common command patterns for STDIO MCPs
  const patterns = [
    "mesh-bridge.*server", // Mesh bridge server
    "pilot.*server/main", // Pilot server
  ];

  for (const pattern of patterns) {
    try {
      // Use pkill with -f to match full command line
      // -9 for SIGKILL to ensure termination
      await execAsync(`pkill -9 -f "${pattern}" 2>/dev/null || true`);
    } catch {
      // Ignore errors - process might not exist
    }
  }

  // Also kill anything listening on port 9999 (Bridge WebSocket)
  try {
    const { stdout } = await execAsync(`lsof -t -i:9999 2>/dev/null || true`);
    const pids = stdout.trim().split("\n").filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
        console.log(
          `[StableStdio] Killed orphaned process on port 9999: PID ${pid}`,
        );
      } catch {
        // Process might already be dead
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Force close all connections and clear the pool
 * Used on app startup/HMR to ensure fresh processes with new credentials
 */
export async function resetStdioConnectionPool(): Promise<void> {
  console.log(
    `[StableStdio] Reset requested. Pool size: ${connectionPool.size}, keys: [${Array.from(connectionPool.keys()).join(", ")}]`,
  );

  // First, close connections we know about in the pool
  if (connectionPool.size > 0) {
    console.log(
      `[StableStdio] Resetting ${connectionPool.size} connections (killing processes)`,
    );
    await forceCloseAllStdioConnections();
    console.log(
      `[StableStdio] Reset complete. Pool size: ${connectionPool.size}`,
    );
  } else {
    console.log(`[StableStdio] Pool was empty, nothing to reset`);
  }

  // Then, kill any orphaned processes that might be left from previous runs
  // (handles case where pool was empty but old processes are still running)
  await killOrphanedStdioProcesses();
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
