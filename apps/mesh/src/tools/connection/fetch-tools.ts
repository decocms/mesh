/**
 * Shared utility to fetch tools from an MCP connection
 *
 * Used by create/update to populate tools at save time.
 * Supports HTTP, SSE, and STDIO transports based on connection_type.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@/api/utils/sse-client-transport";
import type {
  ConnectionParameters,
  HttpConnectionParameters,
  ToolDefinition,
} from "./schema";
import { isStdioParameters } from "./schema";

export interface ConnectionForToolFetch {
  id: string;
  title: string;
  connection_type: "HTTP" | "SSE" | "Websocket" | "STDIO";
  connection_url?: string | null;
  connection_token?: string | null;
  connection_headers?: ConnectionParameters | null;
}

export async function fetchToolsFromMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  switch (connection.connection_type) {
    case "STDIO":
      return fetchToolsFromStdioMCP(connection);
    case "HTTP":
    case "Websocket":
      return fetchToolsFromHttpMCP(connection);
    case "SSE":
      return fetchToolsFromSSEMCP(connection);
    default:
      return null;
  }
}

async function fetchToolsFromHttpMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  if (!connection.connection_url) return null;

  let client: Client | null = null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (connection.connection_token) {
      headers.Authorization = `Bearer ${connection.connection_token}`;
    }

    const httpParams =
      connection.connection_headers as HttpConnectionParameters | null;
    if (httpParams?.headers) {
      Object.assign(headers, httpParams.headers);
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(connection.connection_url),
      { requestInit: { headers } },
    );

    client = new Client({ name: "mcp-mesh-tool-fetcher", version: "1.0.0" });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), 10_000);
    });

    await Promise.race([client.connect(transport), timeoutPromise]);
    const result = await Promise.race([client.listTools(), timeoutPromise]);

    if (!result.tools || result.tools.length === 0) return null;

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? undefined,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema
        ? { ...tool.outputSchema, additionalProperties: true }
        : undefined,
    }));
  } catch {
    return null;
  } finally {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
  }
}

async function fetchToolsFromSSEMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  if (!connection.connection_url) return null;

  let client: Client | null = null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (connection.connection_token) {
      headers.Authorization = `Bearer ${connection.connection_token}`;
    }

    const httpParams =
      connection.connection_headers as HttpConnectionParameters | null;
    if (httpParams?.headers) {
      Object.assign(headers, httpParams.headers);
    }

    const transport = new SSEClientTransport(
      new URL(connection.connection_url),
      { requestInit: { headers } },
    );

    client = new Client({ name: "mcp-mesh-tool-fetcher", version: "1.0.0" });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("SSE connection timeout")), 15_000);
    });

    await Promise.race([client.connect(transport), timeoutPromise]);
    const result = await Promise.race([client.listTools(), timeoutPromise]);

    if (!result.tools || result.tools.length === 0) return null;

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? undefined,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema
        ? { ...tool.outputSchema, additionalProperties: true }
        : undefined,
    }));
  } catch {
    return null;
  } finally {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
  }
}

async function fetchToolsFromStdioMCP(
  connection: ConnectionForToolFetch,
): Promise<ToolDefinition[] | null> {
  const stdioParams = isStdioParameters(connection.connection_headers)
    ? connection.connection_headers
    : null;

  if (!stdioParams) return null;

  let client: Client | null = null;

  try {
    const transport = new StdioClientTransport({
      command: stdioParams.command,
      args: stdioParams.args,
      env: stdioParams.envVars,
      cwd: stdioParams.cwd,
    });

    client = new Client({ name: "mcp-mesh-tool-fetcher", version: "1.0.0" });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("STDIO connection timeout")), 10_000);
    });

    await Promise.race([client.connect(transport), timeoutPromise]);
    const result = await Promise.race([client.listTools(), timeoutPromise]);

    if (!result.tools || result.tools.length === 0) return null;

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? undefined,
      inputSchema: tool.inputSchema ?? {},
      outputSchema: tool.outputSchema ?? undefined,
    }));
  } catch {
    return null;
  } finally {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
  }
}
