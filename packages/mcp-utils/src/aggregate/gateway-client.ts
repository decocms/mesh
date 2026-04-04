/**
 * GatewayClient — Aggregates tools, resources, and prompts from multiple
 * MCP clients into a single unified IClient.
 *
 * Key features:
 * - Lazy client resolution (factory functions called on first use, cached)
 * - Auto-pagination (fetches all pages from upstream clients)
 * - Tool/prompt namespacing via slugified client keys (e.g. "my-server_toolName")
 * - Per-client selection filtering (optional allowlist)
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
 * Per-client entry with optional selection filters.
 * When a selection array is provided, only items whose names appear in it
 * are included. An empty array blocks all items. Undefined means pass all.
 */
export interface ClientEntry {
  client: ClientOrFactory;
  tools?: string[];
  resources?: string[];
  prompts?: string[];
}

/**
 * Slugify a string for use as a namespace prefix.
 * Produces lowercase alphanumeric + hyphens.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export class GatewayClient implements IClient {
  private readonly clients: Record<string, ClientEntry>;
  private readonly slugToKey = new Map<string, string>();

  /** Cache of resolved client promises keyed by client key. */
  private readonly resolvedClients = new Map<string, Promise<IClient>>();

  /** Cached list results — set to null to invalidate. */
  private toolsCache: Promise<ListToolsResult> | null = null;
  private resourcesCache: Promise<ListResourcesResult> | null = null;
  private resourceTemplatesCache: Promise<ListResourceTemplatesResult> | null =
    null;
  private promptsCache: Promise<ListPromptsResult> | null = null;

  /** Route map for resources (URIs aren't namespaced). */
  private resourceRouteMap = new Map<string, string>();

  constructor(clients: Record<string, ClientEntry>) {
    this.clients = clients;
    for (const key of Object.keys(clients)) {
      const slug = slugify(key);
      if (this.slugToKey.has(slug)) {
        throw new Error(
          `GatewayClient: duplicate slug "${slug}" from keys "${this.slugToKey.get(slug)}" and "${key}"`,
        );
      }
      this.slugToKey.set(slug, key);
    }
  }

  // ---------------------------------------------------------------------------
  // Namespacing
  // ---------------------------------------------------------------------------

  private namespace(clientKey: string, name: string): string {
    return `${slugify(clientKey)}_${name}`;
  }

  /**
   * Parse a namespaced name into [clientKey, originalName].
   * Splits on the first "_" — slugs never contain underscores.
   */
  private parseNamespace(namespacedName: string): [string, string] {
    const sep = namespacedName.indexOf("_");
    if (sep === -1) {
      throw new Error(
        `GatewayClient: invalid namespaced name "${namespacedName}"`,
      );
    }
    const slug = namespacedName.slice(0, sep);
    const originalName = namespacedName.slice(sep + 1);
    const clientKey = this.slugToKey.get(slug);
    if (!clientKey) {
      throw new Error(
        `GatewayClient: unknown namespace "${slug}" in "${namespacedName}"`,
      );
    }
    return [clientKey, originalName];
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

    const entry = this.clients[key];
    if (!entry) {
      return Promise.reject(
        new Error(`GatewayClient: unknown client key "${key}"`),
      );
    }

    const clientOrFactory = entry.client;
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

  /**
   * Public access to a resolved client by key.
   */
  getResolvedClient(key: string): Promise<IClient> {
    return this.resolveClient(key);
  }

  // ---------------------------------------------------------------------------
  // Auto-pagination helpers
  // ---------------------------------------------------------------------------

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
  // List methods (cached, namespaced, filtered)
  // ---------------------------------------------------------------------------

  listTools(): Promise<ListToolsResult> {
    if (!this.toolsCache) {
      this.toolsCache = this.aggregateTools();
    }
    return this.toolsCache;
  }

  private async aggregateTools(): Promise<ListToolsResult> {
    const tools: Tool[] = [];

    for (const [clientKey, entry] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientTools = await this.fetchAllTools(client);

      const selected = entry.tools;
      const selectedSet = selected ? new Set(selected) : null;

      for (const tool of clientTools) {
        if (selectedSet && !selectedSet.has(tool.name)) continue;

        tools.push({
          ...tool,
          name: this.namespace(clientKey, tool.name),
          _meta: {
            ...(tool._meta ?? {}),
            gatewayClientId: clientKey,
          },
        });
      }
    }

    return { tools };
  }

  listResources(): Promise<ListResourcesResult> {
    if (!this.resourcesCache) {
      this.resourcesCache = this.aggregateResources();
    }
    return this.resourcesCache;
  }

  private async aggregateResources(): Promise<ListResourcesResult> {
    const seen = new Set<string>();
    const resources: Resource[] = [];
    const routeMap = new Map<string, string>();

    for (const [clientKey, entry] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientResources = await this.fetchAllResources(client);

      const selected = entry.resources;
      const selectedSet = selected ? new Set(selected) : null;

      for (const resource of clientResources) {
        if (selectedSet && !selectedSet.has(resource.uri)) continue;

        if (seen.has(resource.uri)) {
          console.warn(
            `GatewayClient: duplicate resource "${resource.uri}" from client "${clientKey}" — skipping`,
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

    for (const [clientKey, _entry] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientTemplates = await this.fetchAllResourceTemplates(client);

      for (const template of clientTemplates) {
        if (seen.has(template.uriTemplate)) {
          console.warn(
            `GatewayClient: duplicate resource template "${template.uriTemplate}" from client "${clientKey}" — skipping`,
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
    const prompts: Prompt[] = [];

    for (const [clientKey, entry] of Object.entries(this.clients)) {
      const client = await this.resolveClient(clientKey);
      const clientPrompts = await this.fetchAllPrompts(client);

      const selected = entry.prompts;
      const selectedSet = selected ? new Set(selected) : null;

      for (const prompt of clientPrompts) {
        if (selectedSet && !selectedSet.has(prompt.name)) continue;

        prompts.push({
          ...prompt,
          name: this.namespace(clientKey, prompt.name),
          _meta: {
            ...(prompt._meta ?? {}),
            gatewayClientId: clientKey,
          },
        });
      }
    }

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
    const [clientKey, originalName] = this.parseNamespace(params.name);
    const client = await this.resolveClient(clientKey);
    return client.callTool(
      { ...params, name: originalName },
      resultSchema,
      options,
    );
  }

  async readResource(
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> {
    const clientKey = await this.resolveResourceRoute(params.uri);
    const client = await this.resolveClient(clientKey);
    return client.readResource(params);
  }

  async getPrompt(
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> {
    const [clientKey, originalName] = this.parseNamespace(params.name);
    const client = await this.resolveClient(clientKey);
    return client.getPrompt({ ...params, name: originalName });
  }

  /**
   * Look up a resource URI in the route map. If not found, refresh and retry.
   */
  private async resolveResourceRoute(uri: string): Promise<string> {
    let clientKey = this.resourceRouteMap.get(uri);
    if (clientKey) return clientKey;

    // Cache might be stale — refresh and retry
    this.resourcesCache = null;
    await this.listResources();

    clientKey = this.resourceRouteMap.get(uri);
    if (clientKey) return clientKey;

    throw new Error(
      `GatewayClient: resource "${uri}" not found in any upstream client`,
    );
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
