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

export const stdioTools = [
  listStdioConnections,
  stopStdioConnection,
  stopAllStdioConnections,
];

