/**
 * Fake MCP Server
 *
 * Creates a fake MCP server with generated tools for benchmarking.
 * Uses the MCP SDK to expose tools that return mock responses.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import type { FakeMcpHandle, ToolWithHandler } from "../types";

/**
 * Simple HTTP transport for the MCP server
 */
class SimpleHttpTransport {
  private messageHandler: ((message: unknown) => Promise<unknown>) | null =
    null;

  onMessage(handler: (message: unknown) => Promise<unknown>): void {
    this.messageHandler = handler;
  }

  async handleRequest(request: unknown): Promise<unknown> {
    if (!this.messageHandler) {
      throw new Error("No message handler registered");
    }
    return this.messageHandler(request);
  }
}

/**
 * Start a fake MCP server with the given tools
 *
 * @param tools - Tools to expose on the server
 * @param port - Port to listen on
 * @returns Handle to the running server
 */
export async function startFakeMCP(
  tools: ToolWithHandler[],
  port: number,
): Promise<FakeMcpHandle> {
  // Create MCP server
  const mcpServer = new McpServer(
    { name: "fake-mcp-benchmark", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // Create tool handler map
  const toolHandlers = new Map(tools.map((t) => [t.tool.name, t.handler]));

  // Create Hono app
  const app = new Hono();

  // Handle MCP requests
  app.post("/", async (c) => {
    try {
      const body = await c.req.json();

      // Handle JSON-RPC requests
      if (body.method === "initialize") {
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "fake-mcp-benchmark",
              version: "1.0.0",
            },
            capabilities: {
              tools: {},
            },
          },
        });
      }

      if (body.method === "notifications/initialized") {
        // No response needed for notifications
        return c.json({ jsonrpc: "2.0", id: body.id, result: {} });
      }

      if (body.method === "tools/list") {
        const result: ListToolsResult = {
          tools: tools.map((t) => t.tool),
        };
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          result,
        });
      }

      if (body.method === "tools/call") {
        const { name, arguments: args } =
          body.params as CallToolRequest["params"];
        const handler = toolHandlers.get(name);

        if (!handler) {
          return c.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Tool not found: ${name}`,
                },
              ],
              isError: true,
            } satisfies CallToolResult,
          });
        }

        const result = await handler(args ?? {});
        return c.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          } satisfies CallToolResult,
        });
      }

      // Unknown method
      return c.json({
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32601,
          message: `Method not found: ${body.method}`,
        },
      });
    } catch (error) {
      const err = error as Error;
      return c.json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`,
        },
      });
    }
  });

  // Health check endpoint
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Start the server
  let server: ReturnType<typeof Bun.serve>;

  try {
    server = Bun.serve({
      port,
      fetch: app.fetch,
    });
  } catch (error) {
    // If port is in use, try to find another one
    const err = error as Error;
    if (
      err.message.includes("EADDRINUSE") ||
      err.message.includes("address already in use")
    ) {
      server = Bun.serve({
        port: 0, // Let the system assign a port
        fetch: app.fetch,
      });
    } else {
      throw error;
    }
  }

  const actualPort = server.port;
  const url = `http://localhost:${actualPort}`;

  return {
    url,
    close: () => {
      server.stop(true);
    },
  };
}
