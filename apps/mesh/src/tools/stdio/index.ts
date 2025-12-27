/**
 * STDIO Connection Management Tools
 *
 * Tools for managing stdio-based MCP connections (npx MCPs).
 * Provides visibility into running processes and their status.
 */

import { stdioManager } from "@/stdio/stdio-manager";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";

/**
 * List all running stdio connections
 */
export const listStdioConnections = defineTool({
  name: "STDIO_LIST" as const,
  description:
    "List all running STDIO MCP connections. Shows status, command, and restart count for each managed process.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    connections: z.array(
      z.object({
        id: z.string(),
        status: z.string(),
        command: z.string(),
        restartCount: z.number(),
        error: z.string().optional(),
      }),
    ),
  }),
  handler: async () => {
    const status = stdioManager.getStatus();
    const connections = Object.entries(status).map(([id, info]) => ({
      id,
      status: info.status,
      command: info.command,
      restartCount: info.restartCount,
      error: info.error,
    }));

    return { connections };
  },
});

/**
 * Stop a specific stdio connection
 */
export const stopStdioConnection = defineTool({
  name: "STDIO_STOP" as const,
  description: "Stop a running STDIO MCP connection by its ID.",
  inputSchema: z.object({
    connectionId: z.string().describe("The connection ID to stop"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  handler: async (input: { connectionId: string }) => {
    const isRunning = stdioManager.isRunning(input.connectionId);
    if (!isRunning) {
      return {
        success: false,
        message: `Connection ${input.connectionId} is not running`,
      };
    }

    await stdioManager.stop(input.connectionId);
    return {
      success: true,
      message: `Connection ${input.connectionId} stopped`,
    };
  },
});

/**
 * Stop all stdio connections
 */
export const stopAllStdioConnections = defineTool({
  name: "STDIO_STOP_ALL" as const,
  description: "Stop all running STDIO MCP connections.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  handler: async () => {
    await stdioManager.stopAll();
    return {
      success: true,
      message: "All STDIO connections stopped",
    };
  },
});

/**
 * Restart a stdio connection
 */
export const restartStdioConnection = defineTool({
  name: "STDIO_RESTART" as const,
  description:
    "Restart a STDIO MCP connection. Stops the current process and spawns a new one on next use.",
  inputSchema: z.object({
    connectionId: z.string().describe("The connection ID to restart"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  handler: async (input: { connectionId: string }) => {
    // Stop the connection - this marks it as stopped
    await stdioManager.stop(input.connectionId);
    // The next spawn() call will automatically restart it
    return {
      success: true,
      message: `Connection ${input.connectionId} stopped. Will restart on next request.`,
    };
  },
});

/**
 * Get logs for a stdio connection
 */
export const getStdioLogs = defineTool({
  name: "STDIO_LOGS" as const,
  description:
    "Get logs from a STDIO MCP connection. Returns recent log entries from the process stderr and lifecycle events.",
  inputSchema: z.object({
    connectionId: z.string().describe("The connection ID to get logs for"),
    since: z
      .number()
      .optional()
      .describe("Only return logs after this timestamp (ms since epoch)"),
  }),
  outputSchema: z.object({
    logs: z.array(
      z.object({
        timestamp: z.number(),
        level: z.enum(["info", "error", "debug"]),
        message: z.string(),
      }),
    ),
    info: z
      .object({
        status: z.string(),
        command: z.string(),
        restartCount: z.number(),
        error: z.string().optional(),
        startedAt: z.number().optional(),
        logsCount: z.number(),
      })
      .nullable(),
  }),
  handler: async (input: { connectionId: string; since?: number }) => {
    const logs = stdioManager.getLogs(input.connectionId, input.since);
    const info = stdioManager.getConnectionInfo(input.connectionId);
    return { logs, info };
  },
});

export const stdioTools = [
  listStdioConnections,
  stopStdioConnection,
  stopAllStdioConnections,
  restartStdioConnection,
  getStdioLogs,
];

