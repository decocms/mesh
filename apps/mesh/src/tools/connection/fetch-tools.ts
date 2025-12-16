/**
 * Shared utility to fetch tools from an MCP connection
 *
 * Used by create/update to populate tools at save time.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
 * Fetches tools from an MCP connection server.
 *
 * @param connection - Connection details for connecting to MCP
 * @returns Array of tool definitions, or null if fetch failed
 */
export async function fetchToolsFromMCP(
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
    console.log("[FETCH_TOOLS] Result:", result);

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
      `Failed to fetch tools from connection ${connection.id}:`,
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
