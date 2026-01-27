/**
 * PassthroughClient
 *
 * Base client class that aggregates tools, resources, and prompts from multiple connections.
 * Extends the MCP SDK Client class and provides passthrough behavior for tools.
 */

import { MCPProxyClient } from "@/api/routes/proxy";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ErrorCode,
  McpError,
  type CallToolRequest,
  type CallToolResult,
  type GetPromptRequest,
  type GetPromptResult,
  type ListPromptsResult,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  type ListToolsResult,
  type Prompt,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Resource,
  type ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import { lazy } from "../../common";
import type { MeshContext } from "../../core/mesh-context";
import type { ToolWithConnection } from "../../tools/code-execution/utils";
import type { ConnectionEntity } from "../../tools/connection/schema";
import type { VirtualMCPConnection } from "../../tools/virtual-mcp/schema";
import type { AggregatorOptions } from "./types";

/** Maps tool name -> { connectionId, originalName } */
interface ToolMapping {
  connectionId: string;
  originalName: string;
}

/** Cached tool data structure */
interface ToolCache {
  tools: ToolWithConnection[];
  mappings: Map<string, ToolMapping>;
  categories: string[];
}

/** Cached resource data structure */
interface ResourceCache {
  resources: Resource[];
  mappings: Map<string, string>; // uri -> connectionId
}

/** Cached prompt data structure */
interface PromptCache {
  prompts: Prompt[];
  mappings: Map<string, string>; // name -> connectionId
}

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
  protected _cachedResourceTemplates: Promise<ResourceTemplate[]>;
  protected _cachedPrompts: Promise<PromptCache>;
  protected _clients: Promise<Map<string, MCPProxyClient>>;
  protected _connections: Map<string, ConnectionEntity>;
  protected _selectionMap: Map<string, VirtualMCPConnection>;

  constructor(
    protected options: AggregatorOptions,
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

    // Build selection map from options.selected
    this._selectionMap = new Map<string, VirtualMCPConnection>();
    for (const selected of options.selected) {
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
    this._cachedTools = lazy(() => this.loadTools());
    this._cachedResources = lazy(() => this.loadResources());
    this._cachedPrompts = lazy(() => this.loadPrompts());
    this._cachedResourceTemplates = lazy(() => this.loadResourceTemplates());
  }

  /**
   * Load tools from all connections
   */
  private async loadTools(): Promise<ToolCache> {
    const clients = await this._clients;

    // Fetch tools from all connections in parallel
    const results = await Promise.allSettled(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          const connection = this._connections.get(connectionId);

          if (!connection) {
            return null;
          }

          const result = await client.listTools();
          let tools = result.tools;

          // Apply inclusion filtering: if selectedTools is specified, filter to only those tools
          const selected = this._selectionMap.get(connectionId);
          if (!!selected?.selected_tools?.length) {
            const selectedSet = new Set(selected.selected_tools);
            tools = tools.filter((t) => selectedSet.has(t.name));
          }

          return {
            connectionId,
            connectionTitle: connection.title,
            tools,
          };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[PassthroughClient] Failed to list tools ${connectionId}: (defaulting to null)`,
              error,
            );
          }
          return null;
        }
      }),
    );

    // Deduplicate and build tools with connection metadata
    const seenNames = new Set<string>();
    const allTools: ToolWithConnection[] = [];
    const mappings = new Map<string, ToolMapping>();
    const categories = new Set<string>();

    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value) continue;

      const { connectionId, connectionTitle, tools } = result.value;
      categories.add(connectionTitle);

      for (const tool of tools) {
        if (seenNames.has(tool.name)) continue;
        seenNames.add(tool.name);

        allTools.push({
          ...tool,
          _meta: { connectionId, connectionTitle },
        });
        mappings.set(tool.name, { connectionId, originalName: tool.name });
      }
    }

    return {
      tools: allTools,
      mappings,
      categories: Array.from(categories).sort(),
    };
  }

  /**
   * Load resources from all connections
   */
  private async loadResources(): Promise<ResourceCache> {
    const clients = await this._clients;

    // Fetch resources from all connections in parallel
    const results = await Promise.allSettled(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          const result = await client.listResources();
          let resources = result.resources;

          // Apply inclusion filtering: if selectedResources is specified, filter to only those resources
          const selected = this._selectionMap.get(connectionId);
          if (!!selected?.selected_resources?.length) {
            const selectedSet = new Set(selected.selected_resources);
            resources = resources.filter((r) => selectedSet.has(r.uri));
          }

          return { connectionId, resources };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[PassthroughClient] Failed to list resources for connection ${connectionId}: (defaulting to empty array)`,
              error,
            );
          }
          return { connectionId, resources: [] as Resource[] };
        }
      }),
    );

    // Build resource URI -> connection mapping (first-wins deduplication)
    const seenUris = new Set<string>();
    const allResources: Resource[] = [];
    const mappings = new Map<string, string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { connectionId, resources } = result.value;
      for (const resource of resources) {
        if (seenUris.has(resource.uri)) continue;
        seenUris.add(resource.uri);

        allResources.push(resource);
        mappings.set(resource.uri, connectionId);
      }
    }

    return { resources: allResources, mappings };
  }

  /**
   * Load resource templates from all connections
   */
  private async loadResourceTemplates(): Promise<ResourceTemplate[]> {
    const clients = await this._clients;

    // Fetch resource templates from all connections in parallel
    const results = await Promise.allSettled(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          const result = await client.listResourceTemplates();
          return { connectionId, templates: result.resourceTemplates };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[PassthroughClient] Failed to list resource templates for connection ${connectionId}: (defaulting to empty array)`,
              error,
            );
          }
          return { connectionId, templates: [] as ResourceTemplate[] };
        }
      }),
    );

    // Aggregate all resource templates
    const allTemplates: ResourceTemplate[] = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { templates } = result.value;
      for (const template of templates) {
        allTemplates.push(template);
      }
    }

    return allTemplates;
  }

  /**
   * Load prompts from all connections
   */
  private async loadPrompts(): Promise<PromptCache> {
    const clients = await this._clients;

    // Fetch prompts from all connections in parallel
    const results = await Promise.allSettled(
      Array.from(clients.entries()).map(async ([connectionId, client]) => {
        try {
          const result = await client.listPrompts();
          let prompts = result.prompts;

          // Apply inclusion filtering: if selectedPrompts is specified, filter to only those prompts
          const selected = this._selectionMap.get(connectionId);
          if (!!selected?.selected_prompts?.length) {
            const selectedSet = new Set(selected.selected_prompts);
            prompts = prompts.filter((p) => selectedSet.has(p.name));
          }

          return { connectionId, prompts };
        } catch (error) {
          console.error(
            `[PassthroughClient] Failed to list prompts for connection ${connectionId}:`,
            error,
          );
          return { connectionId, prompts: [] as Prompt[] };
        }
      }),
    );

    // Build prompt name -> connection mapping (first-wins, like tools)
    const seenNames = new Set<string>();
    const allPrompts: Prompt[] = [];
    const mappings = new Map<string, string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { connectionId, prompts } = result.value;
      for (const prompt of prompts) {
        if (seenNames.has(prompt.name)) continue;
        seenNames.add(prompt.name);

        allPrompts.push(prompt);
        mappings.set(prompt.name, connectionId);
      }
    }

    return { prompts: allPrompts, mappings };
  }

  /**
   * List all aggregated tools (passthrough - exposes all tools directly)
   */
  override async listTools(): Promise<ListToolsResult> {
    const cache = await this._cachedTools;
    return {
      tools: cache.tools,
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

    const mapping = cache.mappings.get(params.name);
    if (!mapping) {
      return {
        content: [{ type: "text", text: `Tool not found: ${params.name}` }],
        isError: true,
      };
    }

    const client = clients.get(mapping.connectionId);
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
      name: mapping.originalName,
      arguments: params.arguments ?? {},
    });

    return result as CallToolResult;
  }

  /**
   * List all aggregated resources
   */
  override async listResources(): Promise<ListResourcesResult> {
    const cache = await this._cachedResources;
    return { resources: cache.resources };
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
   * List all aggregated resource templates
   */
  override async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    const templates = await this._cachedResourceTemplates;
    return { resourceTemplates: templates };
  }

  /**
   * List all aggregated prompts
   */
  override async listPrompts(): Promise<ListPromptsResult> {
    const cache = await this._cachedPrompts;
    return { prompts: cache.prompts };
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
    const mapping = cache.mappings.get(name);
    if (mapping) {
      const client = clients.get(mapping.connectionId);
      if (client) {
        return client.callStreamableTool(mapping.originalName, args);
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
}
