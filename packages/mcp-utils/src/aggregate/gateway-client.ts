/**
 * GatewayClient — Aggregates tools, resources, and prompts from multiple
 * MCP clients into a single unified IClient.
 *
 * Key features:
 * - Lazy client resolution (factory functions called on first use, cached)
 * - Auto-pagination (fetches all pages from upstream clients)
 * - Deduplication (first occurrence wins, collisions logged as warnings)
 * - Routing maps (tool/resource/prompt name → source client key)
 * - Selection filtering (optional allowlist for tools/resources/prompts)
 * - Metadata tagging (_meta.gatewayClientId on every item)
 */

import type {
  CallToolRequest,
  CallToolResult,
  CompatibilityCallToolResult,
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  Prompt,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { IClient } from "../client-like.ts";

/**
 * A concrete IClient instance or a factory that produces one (sync or async).
 * Factories are invoked lazily on first use and the result is cached.
 */
export type ClientOrFactory = IClient | (() => IClient | Promise<IClient>);

/**
 * Options for filtering the aggregated surface area.
 * When a list is provided, only items whose names (or URIs) appear in it
 * are included in the aggregated results.
 */
export interface GatewayClientOptions {
  selected?: {
    tools?: string[];
    resources?: string[];
    prompts?: string[];
  };
}

export class GatewayClient implements IClient {
  private readonly clients: Record<string, ClientOrFactory>;
  private readonly options: GatewayClientOptions;

  /** Cache of resolved client promises keyed by client key. */
  private readonly resolvedClients = new Map<string, Promise<IClient>>();

  /** Cached list results — set to null to invalidate. */
  private toolsCache: Promise<ListToolsResult> | null = null;
  private resourcesCache: Promise<ListResourcesResult> | null = null;
  private resourceTemplatesCache: Promise<ListResourceTemplatesResult> | null =
    null;
  private promptsCache: Promise<ListPromptsResult> | null = null;

  /** Routing maps built during list operations. */
  private toolRouteMap = new Map<string, string>();
  private resourceRouteMap = new Map<string, string>();
  private promptRouteMap = new Map<string, string>();

  constructor(
    clients: Record<string, ClientOrFactory>,
    options?: GatewayClientOptions,
  ) {
    this.clients = clients;
    this.options = options ?? {};
  }

  // ---------------------------------------------------------------------------
  // Client resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a ClientOrFactory to a concrete IClient. The resolved Promise is
   * cached so concurrent calls for the same key share a single resolution.
   * If the factory throws, the cached promise is removed so subsequent calls
   * retry the factory.
   */
  private resolveClient(key: string): Promise<IClient> {
    const existing = this.resolvedClients.get(key);
    if (existing) {
      return existing;
    }

    const clientOrFactory = this.clients[key];
    if (!clientOrFactory) {
      return Promise.reject(
        new Error(`GatewayClient: unknown client key "${key}"`),
      );
    }

    const promise =
      typeof clientOrFactory === "function"
        ? Promise.resolve(clientOrFactory())
        : Promise.resolve(clientOrFactory);

    // Remove from cache on failure so subsequent calls retry
    const guarded = promise.catch((err) => {
      this.resolvedClients.delete(key);
      throw err;
    });

    this.resolvedClients.set(key, guarded);
    return guarded;
  }

  // ---------------------------------------------------------------------------
  // Auto-pagination helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch all pages from an upstream client list method, aggregating results.
   */
  private async fetchAllTools(client: IClient): Promise<Tool[]> {
    const tools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);
    return tools;
  }

  private async fetchAllResources(client: IClient): Promise<Resource[]> {
    const resources: Resource[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listResources(
        cursor ? { cursor } : undefined,
      );
      resources.push(...result.resources);
      cursor = result.nextCursor;
    } while (cursor);
    return resources;
  }

  private async fetchAllResourceTemplates(
    client: IClient,
  ): Promise<ResourceTemplate[]> {
    const templates: ResourceTemplate[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listResourceTemplates(
        cursor ? { cursor } : undefined,
      );
      templates.push(...result.resourceTemplates);
      cursor = result.nextCursor;
    } while (cursor);
    return templates;
  }

  private async fetchAllPrompts(client: IClient): Promise<Prompt[]> {
    const prompts: Prompt[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listPrompts(cursor ? { cursor } : undefined);
      prompts.push(...result.prompts);
      cursor = result.nextCursor;
    } while (cursor);
    return prompts;
  }

  // ---------------------------------------------------------------------------
  // List methods (cached, deduplicated, filtered)
  // ---------------------------------------------------------------------------

  listTools(): Promise<ListToolsResult> {
    if (!this.toolsCache) {
      this.toolsCache = this.aggregateTools();
    }
    return this.toolsCache;
  }

  private async aggregateTools(): Promise<ListToolsResult> {
    const selectedSet = this.options.selected?.tools
      ? new Set(this.options.selected.tools)
      : null;

    const seen = new Set<string>();
    const tools: Tool[] = [];
    const routeMap = new Map<string, string>();

    for (const [clientKey, _clientOrFactory] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientTools = await this.fetchAllTools(client);

      for (const tool of clientTools) {
        // Selection filter
        if (selectedSet && !selectedSet.has(tool.name)) {
          continue;
        }

        // Deduplication — first occurrence wins
        if (seen.has(tool.name)) {
          console.warn(
            `GatewayClient: duplicate tool "${tool.name}" from client "${clientKey}" — skipping (first occurrence wins)`,
          );
          continue;
        }

        seen.add(tool.name);
        routeMap.set(tool.name, clientKey);
        tools.push({
          ...tool,
          _meta: {
            ...(tool._meta ?? {}),
            gatewayClientId: clientKey,
          },
        });
      }
    }

    this.toolRouteMap = routeMap;
    return { tools };
  }

  listResources(): Promise<ListResourcesResult> {
    if (!this.resourcesCache) {
      this.resourcesCache = this.aggregateResources();
    }
    return this.resourcesCache;
  }

  private async aggregateResources(): Promise<ListResourcesResult> {
    const selectedSet = this.options.selected?.resources
      ? new Set(this.options.selected.resources)
      : null;

    const seen = new Set<string>();
    const resources: Resource[] = [];
    const routeMap = new Map<string, string>();

    for (const [clientKey, _clientOrFactory] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientResources = await this.fetchAllResources(client);

      for (const resource of clientResources) {
        // Selection filter (by URI)
        if (selectedSet && !selectedSet.has(resource.uri)) {
          continue;
        }

        // Deduplication by URI — first occurrence wins
        if (seen.has(resource.uri)) {
          console.warn(
            `GatewayClient: duplicate resource "${resource.uri}" from client "${clientKey}" — skipping (first occurrence wins)`,
          );
          continue;
        }

        seen.add(resource.uri);
        routeMap.set(resource.uri, clientKey);
        resources.push({
          ...resource,
          _meta: {
            ...(resource._meta ?? {}),
            gatewayClientId: clientKey,
          },
        });
      }
    }

    this.resourceRouteMap = routeMap;
    return { resources };
  }

  listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    if (!this.resourceTemplatesCache) {
      this.resourceTemplatesCache = this.aggregateResourceTemplates();
    }
    return this.resourceTemplatesCache;
  }

  private async aggregateResourceTemplates(): Promise<ListResourceTemplatesResult> {
    const seen = new Set<string>();
    const resourceTemplates: ResourceTemplate[] = [];

    for (const [clientKey, _clientOrFactory] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientTemplates = await this.fetchAllResourceTemplates(client);

      for (const template of clientTemplates) {
        // Deduplication by uriTemplate — first occurrence wins
        if (seen.has(template.uriTemplate)) {
          console.warn(
            `GatewayClient: duplicate resource template "${template.uriTemplate}" from client "${clientKey}" — skipping (first occurrence wins)`,
          );
          continue;
        }

        seen.add(template.uriTemplate);
        resourceTemplates.push({
          ...template,
          _meta: {
            ...(template._meta ?? {}),
            gatewayClientId: clientKey,
          },
        });
      }
    }

    return { resourceTemplates };
  }

  listPrompts(): Promise<ListPromptsResult> {
    if (!this.promptsCache) {
      this.promptsCache = this.aggregatePrompts();
    }
    return this.promptsCache;
  }

  private async aggregatePrompts(): Promise<ListPromptsResult> {
    const selectedSet = this.options.selected?.prompts
      ? new Set(this.options.selected.prompts)
      : null;

    const seen = new Set<string>();
    const prompts: Prompt[] = [];
    const routeMap = new Map<string, string>();

    for (const [clientKey, _clientOrFactory] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientPrompts = await this.fetchAllPrompts(client);

      for (const prompt of clientPrompts) {
        // Selection filter
        if (selectedSet && !selectedSet.has(prompt.name)) {
          continue;
        }

        // Deduplication by name — first occurrence wins
        if (seen.has(prompt.name)) {
          console.warn(
            `GatewayClient: duplicate prompt "${prompt.name}" from client "${clientKey}" — skipping (first occurrence wins)`,
          );
          continue;
        }

        seen.add(prompt.name);
        routeMap.set(prompt.name, clientKey);
        prompts.push({
          ...prompt,
          _meta: {
            ...(prompt._meta ?? {}),
            gatewayClientId: clientKey,
          },
        });
      }
    }

    this.promptRouteMap = routeMap;
    return { prompts };
  }

  // ---------------------------------------------------------------------------
  // Routing: callTool / readResource / getPrompt
  // ---------------------------------------------------------------------------

  async callTool(
    params: CallToolRequest["params"],
    resultSchema?: unknown,
    options?: { timeout?: number },
  ): Promise<CallToolResult | CompatibilityCallToolResult> {
    const clientKey = await this.resolveRoute(
      "tool",
      params.name,
      this.toolRouteMap,
      () => this.listTools(),
    );

    const client = await this.resolveClient(clientKey);
    return client.callTool(params, resultSchema, options);
  }

  async readResource(
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> {
    const clientKey = await this.resolveRoute(
      "resource",
      params.uri,
      this.resourceRouteMap,
      () => this.listResources(),
    );

    const client = await this.resolveClient(clientKey);
    return client.readResource(params);
  }

  async getPrompt(
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> {
    const clientKey = await this.resolveRoute(
      "prompt",
      params.name,
      this.promptRouteMap,
      () => this.listPrompts(),
    );

    const client = await this.resolveClient(clientKey);
    return client.getPrompt(params);
  }

  /**
   * Look up a client key in the given route map. If not found, refresh the
   * corresponding list cache and try again. Throws if still not found.
   */
  private async resolveRoute(
    kind: "tool" | "resource" | "prompt",
    key: string,
    routeMap: Map<string, string>,
    refreshFn: () => Promise<unknown>,
  ): Promise<string> {
    let clientKey = routeMap.get(key);
    if (clientKey) {
      return clientKey;
    }

    // Cache might be stale — refresh and retry
    this.invalidateCache(kind);
    await refreshFn();

    clientKey = routeMap.get(key);
    if (clientKey) {
      return clientKey;
    }

    throw new Error(
      `GatewayClient: ${kind} "${key}" not found in any upstream client`,
    );
  }

  /**
   * Invalidate the cache for a specific kind.
   */
  private invalidateCache(kind: "tool" | "resource" | "prompt"): void {
    switch (kind) {
      case "tool":
        this.toolsCache = null;
        break;
      case "resource":
        this.resourcesCache = null;
        this.resourceTemplatesCache = null;
        break;
      case "prompt":
        this.promptsCache = null;
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Capabilities & instructions
  // ---------------------------------------------------------------------------

  getServerCapabilities(): ServerCapabilities {
    return { tools: {}, resources: {}, prompts: {} };
  }

  getInstructions(): undefined {
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Invalidate all cached list results. The next call to any list method
   * will re-fetch from all upstream clients.
   */
  refresh(): void {
    this.toolsCache = null;
    this.resourcesCache = null;
    this.resourceTemplatesCache = null;
    this.promptsCache = null;
  }

  /**
   * Close all resolved (materialized) clients. Uses Promise.allSettled so
   * a failure in one client does not prevent closing others.
   */
  async close(): Promise<void> {
    const closePromises = [...this.resolvedClients.values()].map((p) =>
      p
        .then((client) => client.close())
        .catch(() => {
          // Intentionally ignored — partial close failures are acceptable
        }),
    );
    await Promise.allSettled(closePromises);
  }
}
