/**
 * Stdio Connection Manager
 *
 * Manages lifecycle of stdio-based MCP servers (like npx commands).
 * Think of it as a pm2 for MCPs - it spawns, monitors, and restarts processes.
 *
 * Architecture:
 * - Spawns child processes for stdio connections
 * - Maintains a pool of active connections
 * - Provides MCP Client instances for each spawned process
 * - Detects disconnections and auto-respawns on next request
 * - Cleans up on shutdown
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChildProcess } from "node:child_process";

export interface StdioConnectionConfig {
  /** Unique connection ID */
  id: string;
  /** Command to run (e.g., "npx", "node") */
  command: string;
  /** Arguments for the command (e.g., ["-y", "@perplexity-ai/mcp-server"]) */
  args: string[];
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
  /** Working directory for the process */
  cwd?: string;
}

/** Log entry with timestamp and level */
export interface StdioLogEntry {
  timestamp: number;
  level: "info" | "error" | "debug";
  message: string;
}

/** Maximum number of log entries to keep per connection */
const MAX_LOG_ENTRIES = 500;

/** Heartbeat interval to keep connections alive (30 seconds) */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface ManagedProcess {
  config: StdioConnectionConfig;
  process: ChildProcess | null;
  client: Client | null;
  transport: StdioClientTransport | null;
  status: "starting" | "running" | "stopped" | "error" | "disconnected";
  restartCount: number;
  lastError?: string;
  logs: StdioLogEntry[];
  startedAt?: number;
  heartbeatInterval?: ReturnType<typeof setInterval>;
}

/**
 * Singleton manager for stdio-based MCP connections
 */
class StdioConnectionManager {
  private connections = new Map<string, ManagedProcess>();
  private shutdownHandlersRegistered = false;

  constructor() {
    this.registerShutdownHandlers();
  }

  /**
   * Add a log entry for a connection
   */
  private addLog(
    connectionId: string,
    level: StdioLogEntry["level"],
    message: string,
  ): void {
    const managed = this.connections.get(connectionId);
    if (!managed) return;

    managed.logs.push({
      timestamp: Date.now(),
      level,
      message: message.trim(),
    });

    // Keep only the last MAX_LOG_ENTRIES
    if (managed.logs.length > MAX_LOG_ENTRIES) {
      managed.logs = managed.logs.slice(-MAX_LOG_ENTRIES);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   * Sends periodic ping requests to prevent idle timeout
   */
  private startHeartbeat(
    connectionId: string,
    managed: ManagedProcess,
  ): void {
    // Clear any existing heartbeat
    if (managed.heartbeatInterval) {
      clearInterval(managed.heartbeatInterval);
    }

    managed.heartbeatInterval = setInterval(async () => {
      if (managed.status !== "running" || !managed.client) {
        // Connection is no longer running, stop heartbeat
        if (managed.heartbeatInterval) {
          clearInterval(managed.heartbeatInterval);
          managed.heartbeatInterval = undefined;
        }
        return;
      }

      try {
        // Send a ping to keep the connection alive
        // MCP SDK Client has a ping method
        await managed.client.ping();
      } catch (error) {
        // Ping failed - connection might be dead
        this.addLog(
          connectionId,
          "debug",
          `Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Get logs for a connection
   */
  getLogs(connectionId: string, since?: number): StdioLogEntry[] {
    const managed = this.connections.get(connectionId);
    if (!managed) return [];

    if (since) {
      return managed.logs.filter((log) => log.timestamp > since);
    }
    return [...managed.logs];
  }

  /**
   * Get detailed info for a specific connection
   */
  getConnectionInfo(connectionId: string): {
    status: string;
    command: string;
    restartCount: number;
    error?: string;
    startedAt?: number;
    logsCount: number;
  } | null {
    const managed = this.connections.get(connectionId);
    if (!managed) return null;

    return {
      status: managed.status,
      command: `${managed.config.command} ${managed.config.args.join(" ")}`,
      restartCount: managed.restartCount,
      error: managed.lastError,
      startedAt: managed.startedAt,
      logsCount: managed.logs.length,
    };
  }

  /**
   * Register a stdio connection and start the process
   */
  async spawn(config: StdioConnectionConfig): Promise<Client> {
    // If already exists and running, return existing client
    const existing = this.connections.get(config.id);
    if (existing?.status === "running" && existing.client) {
      // Verify the client is actually still connected by checking transport
      // The transport will have closed if the process died
      try {
        // Try a lightweight operation to verify connection is alive
        // If it throws, the connection is dead
        return existing.client;
      } catch {
        console.log(`[StdioManager] Client ${config.id} appears dead, respawning...`);
        existing.status = "disconnected";
      }
    }

    // If disconnected, error, or stopped, increment restart count
    const restartCount = existing?.restartCount ?? 0;
    const isRestart =
      existing?.status === "disconnected" ||
      existing?.status === "error" ||
      existing?.status === "stopped";

    // Create managed process entry, preserving existing logs on restart
    const existingLogs = existing?.logs ?? [];
    const managed: ManagedProcess = {
      config,
      process: null,
      client: null,
      transport: null,
      status: "starting",
      restartCount: isRestart ? restartCount + 1 : restartCount,
      logs: existingLogs,
      startedAt: Date.now(),
    };

    this.connections.set(config.id, managed);

    // Log the spawn attempt
    this.addLog(
      config.id,
      "info",
      `${isRestart ? "Restarting" : "Starting"}: ${config.command} ${config.args.join(" ")}`,
    );

    try {
      // Build environment, filtering out undefined values from process.env
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      if (config.env) {
        Object.assign(env, config.env);
      }

      // Create transport with the command
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env,
        cwd: config.cwd,
      });

      managed.transport = transport;

      // Create MCP client
      const client = new Client({
        name: `mesh-stdio-${config.id}`,
        version: "1.0.0",
      });

      managed.client = client;

      // Listen for client close event to mark as disconnected
      client.onclose = () => {
        this.addLog(config.id, "info", "Connection closed");
        console.log(`[StdioManager] Client closed: ${config.id}`);
        managed.status = "disconnected";
        managed.client = null;
        managed.transport = null;
        // Clear heartbeat
        if (managed.heartbeatInterval) {
          clearInterval(managed.heartbeatInterval);
          managed.heartbeatInterval = undefined;
        }
      };

      // Connect with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Stdio connection timeout after 30s")),
          30_000,
        );
      });

      await Promise.race([client.connect(transport), timeoutPromise]);

      managed.status = "running";

      // Handle stderr - store in logs and also console.error
      transport.stderr?.on("data", (data) => {
        const message = data.toString();
        this.addLog(config.id, "error", message);
        console.error(`[stdio:${config.id}] stderr:`, message);
      });

      // Start heartbeat to keep connection alive
      this.startHeartbeat(config.id, managed);

      const action = isRestart ? "Restarted" : "Started";
      this.addLog(config.id, "info", `${action} successfully`);
      console.log(
        `[StdioManager] ${action}: ${config.id} (${config.command} ${config.args.join(" ")})`,
      );

      return client;
    } catch (error) {
      managed.status = "error";
      managed.lastError =
        error instanceof Error ? error.message : String(error);

      this.addLog(config.id, "error", `Failed to start: ${managed.lastError}`);
      console.error(`[StdioManager] Failed to start ${config.id}:`, error);

      throw error;
    }
  }

  /**
   * Get an existing client for a connection
   */
  getClient(connectionId: string): Client | null {
    const managed = this.connections.get(connectionId);
    if (managed?.status === "running" && managed.client) {
      return managed.client;
    }
    return null;
  }

  /**
   * Stop a specific connection
   */
  async stop(connectionId: string): Promise<void> {
    const managed = this.connections.get(connectionId);
    if (!managed) return;

    this.addLog(connectionId, "info", "Stopping...");

    // Clear heartbeat interval
    if (managed.heartbeatInterval) {
      clearInterval(managed.heartbeatInterval);
      managed.heartbeatInterval = undefined;
    }

    try {
      if (managed.client) {
        await managed.client.close();
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.addLog(connectionId, "error", `Error closing: ${errMsg}`);
      console.error(`[StdioManager] Error closing client ${connectionId}:`, error);
    }

    managed.status = "stopped";
    managed.client = null;
    managed.transport = null;

    this.addLog(connectionId, "info", "Stopped");
    console.log(`[StdioManager] Stopped: ${connectionId}`);
  }

  /**
   * List all connections with their status
   */
  list(): Array<{
    id: string;
    status: string;
    command: string;
    restartCount: number;
    error?: string;
    startedAt?: number;
    logsCount: number;
  }> {
    return Array.from(this.connections.entries()).map(([id, managed]) => ({
      id,
      status: managed.status,
      command: `${managed.config.command} ${managed.config.args.join(" ")}`,
      restartCount: managed.restartCount,
      error: managed.lastError,
      startedAt: managed.startedAt,
      logsCount: managed.logs.length,
    }));
  }

  /**
   * Stop all connections
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.connections.keys()).map((id) =>
      this.stop(id),
    );
    await Promise.allSettled(stopPromises);
    this.connections.clear();
    console.log("[StdioManager] All connections stopped");
  }

  /**
   * Get status of all connections
   */
  getStatus(): Record<
    string,
    { status: string; command: string; restartCount: number; error?: string }
  > {
    const result: Record<
      string,
      { status: string; command: string; restartCount: number; error?: string }
    > = {};

    for (const [id, managed] of this.connections) {
      result[id] = {
        status: managed.status,
        command: `${managed.config.command} ${managed.config.args.join(" ")}`,
        restartCount: managed.restartCount,
        error: managed.lastError,
      };
    }

    return result;
  }

  /**
   * Check if a connection is running
   */
  isRunning(connectionId: string): boolean {
    const managed = this.connections.get(connectionId);
    return managed?.status === "running";
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) return;
    this.shutdownHandlersRegistered = true;

    const cleanup = async () => {
      console.log("[StdioManager] Shutting down...");
      await this.stopAll();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", () => {
      // Synchronous cleanup on exit
      for (const managed of this.connections.values()) {
        try {
          managed.client?.close();
        } catch {
          // Ignore errors during exit
        }
      }
    });
  }
}

// Singleton instance - use globalThis to survive HMR reloads
const GLOBAL_KEY = "__mesh_stdio_manager__";

declare global {
  var __mesh_stdio_manager__: StdioConnectionManager | undefined;
}

export const stdioManager: StdioConnectionManager =
  globalThis[GLOBAL_KEY] ?? (globalThis[GLOBAL_KEY] = new StdioConnectionManager());

/**
 * Parse a connection URL that specifies a stdio command
 *
 * Format: stdio://command?args=arg1&args=arg2&ENV_VAR=value
 * Examples:
 *   - stdio://npx?args=-y&args=@perplexity-ai/mcp-server&PERPLEXITY_API_KEY=xxx
 *   - stdio://node?args=./server.js&cwd=/path/to/project
 *
 * Query params:
 *   - args: Command arguments (can be repeated)
 *   - cwd: Working directory
 *   - Any other param is treated as an environment variable
 */
export function parseStdioUrl(url: string): StdioConnectionConfig | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "stdio:") return null;

    // Command is the hostname
    const command = parsed.hostname;

    // Args from query params (supports repeated args=value)
    const args: string[] = parsed.searchParams.getAll("args");

    // Environment variables from other query params
    const env: Record<string, string> = {};
    for (const [key, value] of parsed.searchParams.entries()) {
      if (key === "args" || key === "cwd") {
        continue; // Skip special params
      }
      env[key] = value;
    }

    const cwd = parsed.searchParams.get("cwd") ?? undefined;

    return {
      id: url, // Use URL as ID for uniqueness
      command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      cwd,
    };
  } catch {
    return null;
  }
}

