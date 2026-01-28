/**
 * PassthroughClient
 *
 * Base client class that aggregates tools, resources, and prompts from multiple connections.
 * Extends the MCP SDK Client class and provides passthrough behavior for tools.
 */

import { MCPProxyClient } from "@/api/routes/proxy";
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
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../../common";
import type { MeshContext } from "../../core/mesh-context";
import type { ToolWithConnection } from "../../tools/code-execution/utils";
import type { ConnectionEntity } from "../../tools/connection/schema";
import type { VirtualMCPConnection } from "../../tools/virtual/schema";
import type { VirtualClientOptions } from "./types";

interface Cache<T> {
  data: T[];
  mappings: Map<string, string>; // key -> connectionId
}

/** Cached tool data structure */
interface ToolCache extends Cache<ToolWithConnection> {}

/** Cached resource data structure */
interface ResourceCache extends Cache<Resource> {}

/** Cached prompt data structure */
interface PromptCache extends Cache<Prompt> {}

/**
 * Create a map of connection ID to proxy entry
 *
 * Creates proxies for all connections in parallel, filtering out failures
 */
async function createProxyMap(
  connections: ConnectionEntity[],
  ctx: MeshContext,
): Promise<Map<string, MCPProxyClient>> {
  const proxyResults = await Promise.all(
    connections.map(async (connection) => {
      try {
        const proxy = await ctx.createMCPProxy(connection);
        return [connection.id, proxy] as const;
      } catch (error) {
        console.error(
          `[aggregator] Failed to create proxy for connection ${connection.id}:`,
          error,
        );
        return null;
      }
    }),
  );

  return new Map(proxyResults.filter((result) => !!result));
}

/**
 * Dispose of all proxies in a map
 * Closes all proxies in parallel, ignoring errors
 */
async function disposeProxyMap(
  proxyMap: Map<string, MCPProxyClient>,
): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [, entry] of proxyMap) {
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
  protected _clients: Promise<Map<string, MCPProxyClient>>;
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

    // Initialize proxy map lazily - shared across all caches
    this._clients = lazy(() =>
      createProxyMap(this.options.connections, this.ctx),
    );

    // Initialize lazy caches - all share the same ProxyCollection
    this._cachedTools = lazy(() => this.loadCache("tools"));
    this._cachedResources = lazy(() => this.loadCache("resources"));
    this._cachedPrompts = lazy(() => this.loadCache("prompts"));
  }

  private async loadCache<T>(
    target: "tools" | "resources" | "prompts",
  ): Promise<Cache<T>> {
    const clients = await this._clients;

    const results = await Promise.all(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          let data =
            target === "tools"
              ? await client.listTools().then((r) => r.tools)
              : target === "resources"
                ? await client.listResources().then((r) => r.resources)
                : await client.listPrompts().then((r) => r.prompts);

          const selected = this._selectionMap.get(connectionId);
          if (selected?.[`selected_${target}`]?.length) {
            const selectedSet = new Set(selected[`selected_${target}`]);
            data = data.filter((item: any) => selectedSet.has(item.name));
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
        const key = item.name;

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
   * Call a tool by name, routing to the correct connection
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
      if (client) {
        return client.callStreamableTool(name, args);
      }
    }

    // Meta-tool or not found - execute through callTool and return JSON
    const result = await this.callTool({ name, arguments: args });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Dispose of all proxies in the collection
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const clients = await this._clients;
    if (clients) {
      await disposeProxyMap(clients);
    }
  }

  /**
   * Close the client and dispose of all proxies
   */
  override async close(): Promise<void> {
    const clients = await this._clients;
    if (clients) {
      await disposeProxyMap(clients);
    }
    await super.close();
  }

  /**
   * Get server instructions from virtual MCP metadata
   */
  override getInstructions(): string | undefined {
    return this.options.virtualMcp.metadata?.instructions;
  }
}
