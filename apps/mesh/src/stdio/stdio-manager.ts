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
 * - Auto-restarts crashed processes
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

interface ManagedProcess {
  config: StdioConnectionConfig;
  process: ChildProcess | null;
  client: Client | null;
  transport: StdioClientTransport | null;
  status: "starting" | "running" | "stopped" | "error";
  restartCount: number;
  lastError?: string;
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
   * Register a stdio connection and start the process
   */
  async spawn(config: StdioConnectionConfig): Promise<Client> {
    // If already exists and running, return existing client
    const existing = this.connections.get(config.id);
    if (existing?.status === "running" && existing.client) {
      return existing.client;
    }

    // Create managed process entry
    const managed: ManagedProcess = {
      config,
      process: null,
      client: null,
      transport: null,
      status: "starting",
      restartCount: existing?.restartCount ?? 0,
    };

    this.connections.set(config.id, managed);

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

      // Connect with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Stdio connection timeout after 30s")),
          30_000,
        );
      });

      await Promise.race([client.connect(transport), timeoutPromise]);

      managed.status = "running";

      // Handle process exit for auto-restart
      transport.stderr?.on("data", (data) => {
        console.error(`[stdio:${config.id}] stderr:`, data.toString());
      });

      console.log(
        `[StdioManager] Started: ${config.id} (${config.command} ${config.args.join(" ")})`,
      );

      return client;
    } catch (error) {
      managed.status = "error";
      managed.lastError =
        error instanceof Error ? error.message : String(error);

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

    try {
      if (managed.client) {
        await managed.client.close();
      }
    } catch (error) {
      console.error(`[StdioManager] Error closing client ${connectionId}:`, error);
    }

    managed.status = "stopped";
    managed.client = null;
    managed.transport = null;

    console.log(`[StdioManager] Stopped: ${connectionId}`);
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

// Singleton instance
export const stdioManager = new StdioConnectionManager();

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

