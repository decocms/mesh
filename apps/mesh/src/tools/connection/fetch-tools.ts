/**
 * Shared utility to fetch tools from an MCP connection
 *
 * Used by create/update to populate tools at save time.
 * Supports both HTTP and STDIO transports.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  parseStdioUrl,
  stdioManager,
} from "../../stdio/stdio-manager";
import type { ToolDefinition } from "./schema";

/**
 * Minimal connection data needed for tool fetching
 */
export interface ConnectionForToolFetch {
  id: string;
  title: string;
  connection_url: string;
  connection_token?: string | null;
  connection_headers?: Record<string, string> | null;
}

/**
 * Special header key for STDIO env var name
 */
const STDIO_ENV_VAR_HEADER = "X-Stdio-Env-Var";

/**
 * Fetches tools from an MCP connection server.
 * Supports both HTTP and STDIO transports.
 *
 * @param connection - Connection details for connecting to MCP
 * @returns Array of tool definitions, or null if fetch failed
 */
export async function fetchToolsFromMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  // Check if this is a stdio connection
  const stdioConfig = parseStdioUrl(connection.connection_url);
  if (stdioConfig) {
    return fetchToolsFromStdioMCP(connection, stdioConfig);
  }

  // HTTP transport
  return fetchToolsFromHttpMCP(connection);
}

/**
 * Fetch tools from an HTTP-based MCP connection
 */
async function fetchToolsFromHttpMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  let client: Client | null = null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (connection.connection_token) {
      headers.Authorization = `Bearer ${connection.connection_token}`;
    }

    if (connection.connection_headers) {
      Object.assign(headers, connection.connection_headers);
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
      outputSchema: tool.outputSchema ?? undefined,
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
  stdioConfig: ReturnType<typeof parseStdioUrl>,
): Promise<ToolDefinition[] | null> {
  if (!stdioConfig) return null;

  try {
    // Merge connection token into env if provided
    const env = { ...stdioConfig.env };
    if (connection.connection_token) {
      // Get env var name from headers, default to MCP_API_TOKEN
      const envVarName =
        connection.connection_headers?.[STDIO_ENV_VAR_HEADER] || "MCP_API_TOKEN";
      env[envVarName] = connection.connection_token;
    }

    // Spawn or get existing client
    const client = await stdioManager.spawn({
      ...stdioConfig,
      id: connection.id, // Use connection ID for process management
      env,
    });

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Tool fetch timeout")), 10_000);
    });

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
  }
  // Note: We don't close the client for STDIO - the stdioManager keeps it running
}
