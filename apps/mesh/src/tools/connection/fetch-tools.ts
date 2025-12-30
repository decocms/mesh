/**
 * Shared utility to fetch tools from an MCP connection
 *
 * Used by create/update to populate tools at save time.
 * Supports HTTP, SSE, and STDIO transports based on connection_type.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  ConnectionParameters,
  HttpConnectionParameters,
  ToolDefinition,
} from "./schema";
import { isStdioParameters } from "./schema";

/**
 * Minimal connection data needed for tool fetching
 */
export interface ConnectionForToolFetch {
  id: string;
  title: string;
  connection_type: "HTTP" | "SSE" | "Websocket" | "STDIO";
  connection_url?: string | null;
  connection_token?: string | null;
  connection_headers?: ConnectionParameters | null;
}

/**
 * Fetches tools from an MCP connection server.
 * Supports HTTP, SSE, and STDIO transports based on connection_type.
 *
 * @param connection - Connection details for connecting to MCP
 * @returns Array of tool definitions, or null if fetch failed
 */
export async function fetchToolsFromMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  switch (connection.connection_type) {
    case "STDIO":
      return fetchToolsFromStdioMCP(connection);

    case "HTTP":
    case "SSE":
    case "Websocket":
      return fetchToolsFromHttpMCP(connection);

    default:
      console.error(`Unknown connection type: ${connection.connection_type}`);
      return null;
  }
}

/**
 * Fetch tools from an HTTP-based MCP connection
 */
async function fetchToolsFromHttpMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  if (!connection.connection_url) {
    console.error(`HTTP connection ${connection.id} missing URL`);
    return null;
  }

  let client: Client | null = null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (connection.connection_token) {
      headers.Authorization = `Bearer ${connection.connection_token}`;
    }

    // Add custom headers from connection_headers
    const httpParams =
      connection.connection_headers as HttpConnectionParameters | null;
    if (httpParams?.headers) {
      Object.assign(headers, httpParams.headers);
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(connection.connection_url),
      { requestInit: { headers } },
    );

    client = new Client({
      name: "mcp-mesh-tool-fetcher",
      version: "1.0.0",
    });

    // Add timeout to prevent hanging connections
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), 10_000);
    });

    await Promise.race([client.connect(transport), timeoutPromise]);
    const result = await Promise.race([client.listTools(), timeoutPromise]);

    if (!result.tools || result.tools.length === 0) {
      return null;
    }

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? undefined,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema
        ? // We strive to have lenient output schemas, so allow additional properties
          { ...tool.outputSchema, additionalProperties: true }
        : undefined,
    }));
  } catch (error) {
    console.error(
      `Failed to fetch tools from HTTP connection ${connection.id}:`,
      error,
    );
    return null;
  } finally {
    try {
      if (client && typeof client.close === "function") {
        await client.close();
      }
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Fetch tools from a STDIO-based MCP connection
 */
async function fetchToolsFromStdioMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  const stdioParams = isStdioParameters(connection.connection_headers)
    ? connection.connection_headers
    : null;

  if (!stdioParams) {
    console.error(`STDIO connection ${connection.id} missing parameters`);
    return null;
  }

  let client: Client | null = null;

  try {
    const transport = new StdioClientTransport({
      command: stdioParams.command,
      args: stdioParams.args,
      env: stdioParams.envVars,
      cwd: stdioParams.cwd,
    });

    client = new Client({
      name: "mcp-mesh-tool-fetcher",
      version: "1.0.0",
    });

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Tool fetch timeout")), 10_000);
    });

    await Promise.race([client.connect(transport), timeoutPromise]);
    const result = await Promise.race([client.listTools(), timeoutPromise]);

    if (!result.tools || result.tools.length === 0) {
      return null;
    }

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? undefined,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema ?? undefined,
    }));
  } catch (error) {
    console.error(
      `Failed to fetch tools from STDIO connection ${connection.id}:`,
      error,
    );
    return null;
  } finally {
    try {
      if (client && typeof client.close === "function") {
        await client.close();
      }
    } catch {
      // Ignore close errors
    }
  }
}
