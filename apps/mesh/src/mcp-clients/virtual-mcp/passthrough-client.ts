/**
 * PassthroughClient
 *
 * Base client class that aggregates tools, resources, and prompts from multiple connections.
 * Extends the MCP SDK Client class and provides passthrough behavior for tools.
 * Also supports virtual tools (JavaScript code defined on the Virtual MCP).
 */

import type { StreamableMCPProxyClient } from "@/api/routes/proxy";
import { createClient } from "@/mcp-clients";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  type CallToolRequest,
  type CallToolResult,
  type GetPromptRequest,
  type GetPromptResult,
  type ListPromptsResult,
  type ListResourcesResult,
  type ListToolsResult,
  type Prompt,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Resource,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../../common";
import type { MeshContext } from "../../core/mesh-context";
import { runCode, type ToolHandler } from "../../sandbox/index";
import type { ToolWithConnection } from "../../tools/code-execution/utils";
import type { ConnectionEntity } from "../../tools/connection/schema";
import {
  getVirtualToolCode,
  type VirtualToolDefinition,
} from "../../tools/virtual-tool/schema";
import type { VirtualMCPConnection } from "../../tools/virtual/schema";
import type { VirtualClientOptions } from "./types";

interface Cache<T> {
  data: T[];
  mappings: Map<string, string>; // key -> connectionId
}

/** Cached tool data structure with virtual tool tracking */
interface ToolCache extends Cache<ToolWithConnection> {
  /** Map of virtual tool names to their definitions */
  virtualTools: Map<string, VirtualToolDefinition>;
}

/** Cached resource data structure */
interface ResourceCache extends Cache<Resource> {}

/** Cached prompt data structure */
interface PromptCache extends Cache<Prompt> {}

/**
 * Create a map of connection ID to client entry
 *
 * Creates clients for all connections in parallel, filtering out failures
 */
async function createClientMap(
  connections: ConnectionEntity[],
  ctx: MeshContext,
): Promise<Map<string, Client>> {
  const clientResults = await Promise.all(
    connections.map(async (connection) => {
      try {
        // Validate connection status
        if (connection.status !== "active") {
          throw new Error(`Connection inactive: ${connection.status}`);
        }

        const client = await createClient(connection, ctx, false);
        return [connection.id, client] as const;
      } catch (error) {
        console.warn(
          `[aggregator] Failed to create client for connection ${connection.id}:`,
          error,
        );
        return null;
      }
    }),
  );

  return new Map(clientResults.filter((result) => !!result));
}

/**
 * Dispose of all clients in a map
 * Closes all clients in parallel, ignoring errors
 */
async function disposeClientMap(clientMap: Map<string, Client>): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [, entry] of clientMap) {
    closePromises.push(entry.close().catch(() => {}));
  }
  await Promise.all(closePromises);
}

/**
 * Base client that aggregates MCP resources from multiple connections.
 * Provides passthrough behavior for tools (exposes all tools directly).
 */
export class PassthroughClient extends Client {
  protected _cachedTools: Promise<ToolCache>;
  protected _cachedResources: Promise<ResourceCache>;
  protected _cachedPrompts: Promise<PromptCache>;
  protected _clients: Promise<Map<string, Client>>;
  protected _connections: Map<string, ConnectionEntity>;
  protected _selectionMap: Map<string, VirtualMCPConnection>;

  constructor(
    protected options: VirtualClientOptions,
    protected ctx: MeshContext,
  ) {
    super(
      {
        name: "virtual-mcp-passthrough",
        version: "1.0.0",
      },
      {
        capabilities: {
          tasks: {
            list: {},
            cancel: {},
            requests: {
              tool: {
                call: {},
              },
            },
          },
        },
      },
    );

    // Build selection map from options.virtualMcp.connections
    this._selectionMap = new Map();
    for (const selected of options.virtualMcp.connections) {
      this._selectionMap.set(selected.connection_id, selected);
    }

    this._connections = new Map<string, ConnectionEntity>();
    for (const connection of options.connections) {
      this._connections.set(connection.id, connection);
    }

    // Initialize client map lazily - shared across all caches
    this._clients = lazy(() =>
      createClientMap(this.options.connections, this.ctx),
    );

    // Initialize lazy caches - all share the same ProxyCollection
    this._cachedTools = lazy(() => this.loadToolsCache());
    this._cachedResources = lazy(() => this.loadCache("resources"));
    this._cachedPrompts = lazy(() => this.loadCache("prompts"));
  }

  /**
   * Load tools cache including virtual tools
   */
  private async loadToolsCache(): Promise<ToolCache> {
    const clients = await this._clients;

    const results = await Promise.all(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          let data = await client.listTools().then((r) => r.tools);

          const selected = this._selectionMap.get(connectionId);
          if (selected?.selected_tools?.length) {
            const selectedSet = new Set(selected.selected_tools);
            data = data.filter((item) => selectedSet.has(item.name));
          }

          return { connectionId, data };
        } catch (error) {
          console.error(
            `[PassthroughClient] Failed to load tools for connection ${connectionId}:`,
            error,
          );
          return null;
        }
      }),
    );

    const flattened: ToolWithConnection[] = [];
    const mappings = new Map<string, string>();
    const virtualToolsMap = new Map<string, VirtualToolDefinition>();

    // First, add virtual tools (they take precedence)
    const virtualTools = this.options.virtualTools ?? [];
    for (const virtualTool of virtualTools) {
      if (mappings.has(virtualTool.name)) continue;

      // Convert virtual tool to Tool format for listing
      const tool: ToolWithConnection = {
        name: virtualTool.name,
        description: virtualTool.description,
        inputSchema: virtualTool.inputSchema as Tool["inputSchema"],
        outputSchema: virtualTool.outputSchema as Tool["outputSchema"],
        annotations: virtualTool.annotations,
        _meta: {
          connectionId: this.options.virtualMcp.id ?? "__VIRTUAL__",
          connectionTitle: this.options.virtualMcp.title,
        },
      };

      flattened.push(tool);
      mappings.set(virtualTool.name, "__VIRTUAL__"); // Special marker for virtual tools
      virtualToolsMap.set(virtualTool.name, virtualTool);
    }

    // Then add downstream tools
    for (const result of results) {
      if (!result) continue;

      const { connectionId, data } = result;
      const connection = this._connections.get(connectionId);
      const connectionTitle = connection?.title ?? "";

      for (const item of data) {
        const key = item.name;

        if (mappings.has(key)) continue;

        const transformedItem: ToolWithConnection = {
          ...item,
          _meta: {
            connectionId,
            connectionTitle,
            ...item?._meta,
          },
        };

        flattened.push(transformedItem);
        mappings.set(key, connectionId);
      }
    }

    return { data: flattened, mappings, virtualTools: virtualToolsMap };
  }

  private async loadCache<T>(
    target: "resources" | "prompts",
  ): Promise<Cache<T>> {
    const clients = await this._clients;

    const results = await Promise.all(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          const data =
            target === "resources"
              ? await client.listResources().then((r) => r.resources)
              : await client.listPrompts().then((r) => r.prompts);

          const selected = this._selectionMap.get(connectionId);
          const selectedKey =
            target === "resources" ? "selected_resources" : "selected_prompts";
          if (selected?.[selectedKey]?.length) {
            const selectedSet = new Set(selected[selectedKey]);
            return {
              connectionId,
              data: data.filter((item: any) => selectedSet.has(item.name)),
            };
          }

          return { connectionId, data };
        } catch (error) {
          console.error(
            `[PassthroughClient] Failed to load cache for connection ${connectionId}:`,
            error,
          );
          return null;
        }
      }),
    );

    const flattened: T[] = [];
    const mappings = new Map<string, string>();

    for (const result of results) {
      if (!result) continue;

      const { connectionId, data } = result;
      const connection = this._connections.get(connectionId);
      const connectionTitle = connection?.title ?? "";

      for (const item of data as any[]) {
        const key = item.name ?? item.uri;

        if (mappings.has(key)) continue;

        const transformedItem = {
          ...item,
          _meta: {
            connectionId,
            connectionTitle,
            ...item?._meta,
          },
        };

        flattened.push(transformedItem);
        mappings.set(key, connectionId);
      }
    }

    return { data: flattened, mappings };
  }

  /**
   * List all aggregated tools (passthrough - exposes all tools directly)
   */
  override async listTools(): Promise<ListToolsResult> {
    const cache = await this._cachedTools;
    return {
      tools: cache.data,
    };
  }

  /**
   * Call a tool by name, routing to the correct connection or executing virtual tool code
   */
  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    const [cache, clients] = await Promise.all([
      this._cachedTools,
      this._clients,
    ]);

    const connectionId = cache.mappings.get(params.name);
    if (!connectionId) {
      return {
        content: [{ type: "text", text: `Tool not found: ${params.name}` }],
        isError: true,
      };
    }

    // Check if this is a virtual tool
    if (connectionId === "__VIRTUAL__") {
      return this.executeVirtualTool(
        params.name,
        params.arguments ?? {},
        cache,
        clients,
      );
    }

    const client = clients.get(connectionId);
    if (!client) {
      return {
        content: [
          {
            type: "text",
            text: `Connection not found for tool: ${params.name}`,
          },
        ],
        isError: true,
      };
    }

    const result = await client.callTool({
      name: params.name,
      arguments: params.arguments ?? {},
    });

    return result as CallToolResult;
  }

  /**
   * Execute a virtual tool by running its JavaScript code in the sandbox
   */
  private async executeVirtualTool(
    toolName: string,
    args: Record<string, unknown>,
    cache: ToolCache,
    clients: Map<string, Client>,
  ): Promise<CallToolResult> {
    const virtualTool = cache.virtualTools.get(toolName);
    if (!virtualTool) {
      return {
        content: [
          { type: "text", text: `Virtual tool not found: ${toolName}` },
        ],
        isError: true,
      };
    }

    const code = getVirtualToolCode(virtualTool);

    // Build tools record for the sandbox
    // This allows virtual tool code to call downstream tools via `tools.TOOL_NAME(args)`
    const toolsRecord: Record<string, ToolHandler> = {};

    for (const [name, connId] of cache.mappings) {
      // Skip virtual tools in the tools record (they can't call other virtual tools)
      if (connId === "__VIRTUAL__") continue;

      const client = clients.get(connId);
      if (!client) continue;

      toolsRecord[name] = async (innerArgs: Record<string, unknown>) => {
        const result = await client.callTool({
          name,
          arguments: innerArgs,
        });
        // Extract the actual content from the result
        const content = result.content as
          | Array<{ type: string; text?: string }>
          | undefined;
        if (content?.[0]?.type === "text" && content[0].text) {
          try {
            return JSON.parse(content[0].text);
          } catch {
            return content[0].text;
          }
        }
        return result;
      };
    }

    try {
      // The virtual tool code format: `export default async (tools, args) => { ... }`
      // We strip `export default` and wrap it to inject args
      const strippedCode = code.replace(/^\s*export\s+default\s+/, "").trim();

      const wrappedCode = `
        const __virtualToolFn = ${strippedCode};
        export default async (tools) => {
          const args = ${JSON.stringify(args)};
          return await __virtualToolFn(tools, args);
        };
      `;

      const result = await runCode({
        code: wrappedCode,
        tools: toolsRecord,
        timeoutMs: 30000, // 30 second timeout for virtual tools
      });

      if (result.error) {
        return {
          content: [
            {
              type: "text",
              text: `Virtual tool error: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.returnValue ?? null),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Virtual tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * List all aggregated resources
   */
  override async listResources(): Promise<ListResourcesResult> {
    const cache = await this._cachedResources;
    return { resources: cache.data };
  }

  /**
   * Read a resource by URI, routing to the correct connection
   */
  override async readResource(
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> {
    const [cache, clients] = await Promise.all([
      this._cachedResources,
      this._clients,
    ]);

    const connectionId = cache.mappings.get(params.uri);
    if (!connectionId) {
      throw new Error(`Resource not found: ${params.uri}`);
    }

    const client = clients.get(connectionId);
    if (!client) {
      throw new Error(`Connection not found for resource: ${params.uri}`);
    }

    return await client.readResource(params);
  }

  /**
   * List all aggregated prompts
   */
  override async listPrompts(): Promise<ListPromptsResult> {
    const cache = await this._cachedPrompts;
    return { prompts: cache.data };
  }

  /**
   * Get a prompt by name, routing to the correct connection
   */
  override async getPrompt(
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> {
    const [cache, clients] = await Promise.all([
      this._cachedPrompts,
      this._clients,
    ]);

    const connectionId = cache.mappings.get(params.name);
    if (!connectionId) {
      throw new Error(`Prompt not found: ${params.name}`);
    }

    const client = clients.get(connectionId);
    if (!client) {
      throw new Error(`Connection not found for prompt: ${params.name}`);
    }

    return await client.getPrompt(params);
  }

  /**
   * Call a tool with streaming support
   */
  async callStreamableTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    const [cache, clients] = await Promise.all([
      this._cachedTools,
      this._clients,
    ]);

    // For direct tools, route to underlying proxy for streaming
    const connectionId = cache.mappings.get(name);
    if (connectionId) {
      const client = clients.get(connectionId);
      if (client && "callStreamableTool" in client) {
        // Type guard: client has streaming support
        const streamableClient = client as StreamableMCPProxyClient;
        return streamableClient.callStreamableTool(name, args);
      }
    }

    // Meta-tool or not found - execute through callTool and return JSON
    const result = await this.callTool({ name, arguments: args });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Dispose of all clients in the collection
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const clients = await this._clients;
    if (clients) {
      await disposeClientMap(clients);
    }
  }

  /**
   * Close the client and dispose of all clients
   */
  override async close(): Promise<void> {
    const clients = await this._clients;
    if (clients) {
      await disposeClientMap(clients);
    }
    await super.close();
  }

  /**
   * Get server instructions from virtual MCP metadata
   */
  override getInstructions(): string | undefined {
    return this.options.virtualMcp.metadata?.instructions ?? undefined;
  }
}
