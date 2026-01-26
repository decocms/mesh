/**
 * Virtual MCP Client
 *
 * Client-based virtual MCP that aggregates tools, resources, and prompts from multiple connections.
 * Extends the SDK Client class to be compatible with createMcpServerBridge.
 */

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
  type ReadResourceRequest,
  type ReadResourceResult,
  type Resource,
  type Prompt,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { lazy } from "../../common";
import {
  describeTools,
  filterCodeExecutionTools,
  jsonError,
  jsonResult,
  runCodeWithTools,
  searchTools,
  type ToolContext,
  type ToolWithConnection,
} from "../../tools/code-execution/utils";
import type { VirtualMCPConnectionEntry } from "./types";

/** Maps tool name -> { connectionId, originalName } */
interface ToolMapping {
  connectionId: string;
  originalName: string;
}

/** Handler for a meta-tool */
type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/** Cached data structure for tools */
export interface ToolCache {
  tools: ToolWithConnection[];
  mappings: Map<string, ToolMapping>;
  categories: string[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
}

/** Cached data structure for resources */
interface ResourceCache {
  resources: Resource[];
  mappings: Map<string, string>; // uri -> connectionId
}

/** Cached data structure for prompts */
interface PromptCache {
  prompts: Prompt[];
  mappings: Map<string, string>; // name -> connectionId
}

/** Cached data structure for resource templates */
interface ResourceTemplateCache {
  templates: Array<{ name: string; uriTemplate: string }>;
}

/**
 * Check if a URI matches a pattern
 * Supports:
 * - Exact match: "file:///path/to/file.txt"
 * - Single segment wildcard (*): "file:///path/*.txt" matches "file:///path/foo.txt"
 * - Multi-segment wildcard (**): "file:///**" matches any path under file://
 */
function matchesPattern(uri: string, pattern: string): boolean {
  // Exact match
  if (uri === pattern) return true;

  // Check if pattern contains wildcards
  if (!pattern.includes("*")) return false;

  // Convert pattern to regex
  // Escape special regex chars except * and **
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/\*\*/g, "<<<DOUBLE_STAR>>>") // Protect **
    .replace(/\*/g, "[^/]*") // Single * matches any non-/ sequence
    .replace(/<<<DOUBLE_STAR>>>/g, ".*"); // ** matches anything

  // Add anchors for full match
  regexPattern = `^${regexPattern}$`;

  try {
    return new RegExp(regexPattern).test(uri);
  } catch {
    return false;
  }
}

/**
 * Check if a URI matches any of the patterns (or is an exact match)
 */
function matchesAnyPattern(uri: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(uri, pattern));
}

/**
 * Passthrough client that exposes all tools directly from virtual MCP connections.
 * Extends the SDK Client class to be compatible with createMcpServerBridge.
 * Subclasses can override listTools() and callTool() to customize behavior.
 */
export class VirtualMCPPassthroughClient extends Client {
  protected _toolCache: Promise<ToolCache>;
  protected _resourceCache: Promise<ResourceCache>;
  protected _promptCache: Promise<PromptCache>;
  protected _resourceTemplateCache: Promise<ResourceTemplateCache>;

  constructor(protected entries: VirtualMCPConnectionEntry[]) {
    super({ name: "virtual-mcp-client", version: "1.0.0" });
    // Create lazy caches - only load when first awaited
    this._toolCache = lazy(() => this.loadTools());
    this._resourceCache = lazy(() => this.loadResources());
    this._promptCache = lazy(() => this.loadPrompts());
    this._resourceTemplateCache = lazy(() => this.loadResourceTemplates());
  }

  /**
   * Load tools from all connections (inclusion mode only)
   */
  private async loadTools(): Promise<ToolCache> {
    // Fetch tools from all connections in parallel
    const results = await Promise.allSettled(
      this.entries.map(async (entry) => {
        const connectionId = entry.connection.id;
        try {
          const result = await entry.client.listTools();
          let tools = result.tools;

          // Inclusion mode: include only selected tools
          if (entry.selectedTools && entry.selectedTools.length > 0) {
            const selectedSet = new Set(entry.selectedTools);
            tools = tools.filter((tool: (typeof tools)[number]) =>
              selectedSet.has(tool.name),
            );
          } else {
            // No tools selected = no tools from this connection
            tools = [];
          }

          return {
            connectionId,
            connectionTitle: entry.connection.title,
            tools,
          };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[virtual-mcp] Failed to list tools ${connectionId}: (defaulting to null)`,
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

    // Create base callTool that routes to the correct connection
    const callTool = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<CallToolResult> => {
      const mapping = mappings.get(name);
      if (!mapping) {
        return {
          content: [{ type: "text", text: `Tool not found: ${name}` }],
          isError: true,
        };
      }

      const entry = this.entries.find(
        (candidate) => candidate.connection.id === mapping.connectionId,
      );
      if (!entry) {
        return {
          content: [
            { type: "text", text: `Connection not found for tool: ${name}` },
          ],
          isError: true,
        };
      }

      const result = await entry.client.callTool({
        name: mapping.originalName,
        arguments: args,
      });

      return result as CallToolResult;
    };

    return {
      tools: allTools,
      mappings,
      categories: Array.from(categories).sort(),
      callTool,
    };
  }

  /**
   * Load resources from all connections (inclusion mode only)
   */
  private async loadResources(): Promise<ResourceCache> {
    // Fetch resources from all connections in parallel
    const results = await Promise.allSettled(
      this.entries.map(async (entry) => {
        const connectionId = entry.connection.id;
        try {
          const result = await entry.client.listResources();
          let resources = result.resources;

          // Inclusion mode: include only selected resources
          // Resources require explicit selection (patterns or URIs)
          if (
            !entry.selectedResources ||
            entry.selectedResources.length === 0
          ) {
            // No resources selected = no resources from this connection
            resources = [];
          } else {
            resources = resources.filter((resource: Resource) =>
              matchesAnyPattern(resource.uri, entry.selectedResources!),
            );
          }

          return { connectionId, resources };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[virtual-mcp] Failed to list resources for connection ${connectionId}: (defaulting to empty array)`,
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
   * Load prompts from all connections (inclusion mode only)
   */
  private async loadPrompts(): Promise<PromptCache> {
    // Fetch prompts from all connections in parallel
    const results = await Promise.allSettled(
      this.entries.map(async (entry) => {
        const connectionId = entry.connection.id;
        try {
          const result = await entry.client.listPrompts();
          let prompts = result.prompts;

          // Inclusion mode: include only selected prompts
          // Prompts require explicit selection (for ice breakers UX)
          if (!entry.selectedPrompts || entry.selectedPrompts.length === 0) {
            // No prompts selected = no prompts from this connection
            prompts = [];
          } else {
            const selectedSet = new Set(entry.selectedPrompts);
            prompts = prompts.filter((prompt: Prompt) =>
              selectedSet.has(prompt.name),
            );
          }

          return { connectionId, prompts };
        } catch (error) {
          console.error(
            `[VirtualMCP] Failed to list prompts for connection ${connectionId}:`,
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
   * Load resource templates from all connections
   */
  private async loadResourceTemplates(): Promise<ResourceTemplateCache> {
    // Fetch resource templates from all connections in parallel
    const results = await Promise.allSettled(
      this.entries.map(async (entry) => {
        const connectionId = entry.connection.id;
        try {
          const result = await entry.client.listResourceTemplates();
          return { connectionId, templates: result.resourceTemplates };
        } catch (error) {
          if (
            !(error instanceof McpError) ||
            error.code !== ErrorCode.MethodNotFound
          ) {
            console.error(
              `[virtual-mcp] Failed to list resource templates for connection ${connectionId}: (defaulting to empty array)`,
              error,
            );
          }
          return { connectionId, templates: [] };
        }
      }),
    );

    // Aggregate all resource templates
    const allTemplates: Array<{ name: string; uriTemplate: string }> = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      const { templates } = result.value;
      for (const template of templates) {
        allTemplates.push(template);
      }
    }

    return { templates: allTemplates };
  }

  /**
   * List all aggregated tools (passthrough behavior - exposes all tools directly)
   */
  override async listTools(): Promise<ListToolsResult> {
    const cache = await this._toolCache;
    return { tools: cache.tools };
  }

  /**
   * Call a tool by name, routing to the correct connection
   */
  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    const cache = await this._toolCache;
    return cache.callTool(params.name, params.arguments ?? {});
  }

  /**
   * List all aggregated resources
   */
  override async listResources(): Promise<ListResourcesResult> {
    const cache = await this._resourceCache;
    return { resources: cache.resources };
  }

  /**
   * Read a resource by URI, routing to the correct connection
   */
  override async readResource(
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> {
    const cache = await this._resourceCache;

    const connectionId = cache.mappings.get(params.uri);
    if (!connectionId) {
      throw new Error(`Resource not found: ${params.uri}`);
    }

    const entry = this.entries.find(
      (candidate) => candidate.connection.id === connectionId,
    );
    if (!entry) {
      throw new Error(`Connection not found for resource: ${params.uri}`);
    }

    return await entry.client.readResource(params);
  }

  /**
   * List all aggregated resource templates
   */
  override async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    const cache = await this._resourceTemplateCache;
    return { resourceTemplates: cache.templates };
  }

  /**
   * List all aggregated prompts
   */
  override async listPrompts(): Promise<ListPromptsResult> {
    const cache = await this._promptCache;
    return { prompts: cache.prompts };
  }

  /**
   * Get a prompt by name, routing to the correct connection
   */
  override async getPrompt(
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> {
    const cache = await this._promptCache;

    const connectionId = cache.mappings.get(params.name);
    if (!connectionId) {
      throw new Error(`Prompt not found: ${params.name}`);
    }

    const entry = this.entries.find(
      (candidate) => candidate.connection.id === connectionId,
    );
    if (!entry) {
      throw new Error(`Connection not found for prompt: ${params.name}`);
    }

    return await entry.client.getPrompt(params);
  }

  /**
   * Call a tool with streaming support
   */
  async callStreamableTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    const cache = await this._toolCache;

    // For direct tools, route to underlying proxy for streaming
    const mapping = cache.mappings.get(name);
    if (mapping) {
      const entry = this.entries.find(
        (candidate) => candidate.connection.id === mapping.connectionId,
      );
      if (entry?.callStreamableTool) {
        return entry.callStreamableTool(mapping.originalName, args);
      }
    }

    // Tool not found or no streaming support - execute through callTool
    const result = await cache.callTool(name, args);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ============================================================================
// Cached JSON Schemas (avoid repeated z.toJSONSchema calls)
// Zod 4's toJSONSchema accumulates in __zod_globalRegistry causing memory leaks
// ============================================================================

const SEARCH_INPUT_SCHEMA = z.object({
  query: z
    .string()
    .min(1)
    .describe("Search query to find tools by name or description"),
  limit: z.number().default(10).describe("Maximum number of results to return"),
});
const SEARCH_INPUT_JSON_SCHEMA = z.toJSONSchema(
  SEARCH_INPUT_SCHEMA,
) as Tool["inputSchema"];

const DESCRIBE_INPUT_SCHEMA = z.object({
  tools: z
    .array(z.string())
    .min(1)
    .describe("Array of tool names to get detailed schemas for"),
});
const DESCRIBE_INPUT_JSON_SCHEMA = z.toJSONSchema(
  DESCRIBE_INPUT_SCHEMA,
) as Tool["inputSchema"];

const RUN_CODE_INPUT_SCHEMA = z.object({
  code: z
    .string()
    .min(1)
    .describe(
      "JavaScript code to execute. It runs as an async function body; you can use top-level `return` and `await`.",
    ),
  timeoutMs: z
    .number()
    .default(3000)
    .describe("Max execution time in milliseconds (default: 3000)."),
});
const RUN_CODE_INPUT_JSON_SCHEMA = z.toJSONSchema(
  RUN_CODE_INPUT_SCHEMA,
) as Tool["inputSchema"];

type CallToolInput = {
  name: string;
  arguments: Record<string, unknown>;
};

// Cache for dynamic CALL_TOOL schemas (keyed by sorted tool names)
const callToolSchemaCache = new Map<
  string,
  { schema: z.ZodType<CallToolInput>; jsonSchema: Tool["inputSchema"] }
>();

function getCallToolSchema(toolNames: string[]): {
  schema: z.ZodType<CallToolInput>;
  jsonSchema: Tool["inputSchema"];
} {
  const cacheKey = toolNames.slice().sort().join(",");
  let cached = callToolSchemaCache.get(cacheKey);
  if (!cached) {
    const schema: z.ZodType<CallToolInput> = z.object({
      name: (toolNames.length > 0
        ? z.enum(toolNames as [string, ...string[]])
        : z.string()
      ).describe("The name of the tool to execute"),
      arguments: z
        .record(z.string(), z.unknown())
        .default({})
        .describe("Arguments to pass to the tool"),
    });
    cached = {
      schema,
      jsonSchema: z.toJSONSchema(schema) as Tool["inputSchema"],
    };
    callToolSchemaCache.set(cacheKey, cached);
  }
  return cached;
}

// ============================================================================
// Meta-Tool Helpers
// ============================================================================

interface ToolWithHandler {
  tool: Tool;
  handler: ToolHandler;
}

/**
 * Create the shared GATEWAY_SEARCH_TOOLS and GATEWAY_DESCRIBE_TOOLS meta-tools
 */
function createDiscoveryMetaTools(
  filteredTools: ToolWithConnection[],
  categories: string[],
): ToolWithHandler[] {
  const categoryList =
    categories.length > 0
      ? ` Available categories: ${categories.join(", ")}.`
      : "";

  return [
    // Search tool
    {
      tool: {
        name: "GATEWAY_SEARCH_TOOLS",
        description: `Search for available tools by name or description. Returns tool names and brief descriptions without full schemas. Use this to discover tools before calling GATEWAY_DESCRIBE_TOOLS for detailed schemas.${categoryList} Total tools: ${filteredTools.length}.`,
        inputSchema: SEARCH_INPUT_JSON_SCHEMA,
      },
      handler: async (args) => {
        const parsed = SEARCH_INPUT_SCHEMA.safeParse(args);
        if (!parsed.success) {
          return jsonError({ error: parsed.error.flatten() });
        }
        const results = searchTools(
          parsed.data.query,
          filteredTools,
          parsed.data.limit,
        );
        return jsonResult({
          query: parsed.data.query,
          results: results.map((t) => ({
            name: t.name,
            description: t.description,
            connection: t._meta.connectionTitle,
          })),
          totalAvailable: filteredTools.length,
        });
      },
    },
    // Describe tool
    {
      tool: {
        name: "GATEWAY_DESCRIBE_TOOLS",
        description:
          "Get detailed schemas for specific tools. Call after GATEWAY_SEARCH_TOOLS to get full input/output schemas.",
        inputSchema: DESCRIBE_INPUT_JSON_SCHEMA,
      },
      handler: async (args) => {
        const parsed = DESCRIBE_INPUT_SCHEMA.safeParse(args);
        if (!parsed.success) {
          return jsonError({ error: parsed.error.flatten() });
        }
        const result = describeTools(parsed.data.tools, filteredTools);
        return jsonResult({
          tools: result.tools,
          notFound: result.notFound,
        });
      },
    },
  ];
}

// ============================================================================
// Extended Clients
// ============================================================================

/**
 * Smart tool selection client - exposes meta-tools for discovery
 */
export class VirtualMCPSmartToolClient extends VirtualMCPPassthroughClient {
  private _toolsCache: Promise<{
    tools: Tool[];
    handlers: Map<string, ToolHandler>;
    filteredTools: ToolWithConnection[];
  }> | null = null;

  private async createTools() {
    if (!this._toolsCache) {
      this._toolsCache = this._toolCache.then((cache) => {
        // Filter out CODE_EXECUTION_* tools to avoid duplication
        const filteredTools = filterCodeExecutionTools(cache.tools);
        const toolNames = filteredTools.map((t) => t.name);
        const toolMap = new Map(filteredTools.map((t) => [t.name, t]));

        // Use cached schema to avoid repeated z.toJSONSchema calls
        const { schema: callToolInputSchema, jsonSchema: callToolJsonSchema } =
          getCallToolSchema(toolNames);

        const toolsWithHandlers: ToolWithHandler[] = [
          // Shared discovery tools
          ...createDiscoveryMetaTools(filteredTools, cache.categories),
          // Call tool
          {
            tool: {
              name: "GATEWAY_CALL_TOOL",
              description:
                "Execute a tool by name. Use GATEWAY_DESCRIBE_TOOLS first to understand the input schema.",
              inputSchema: callToolJsonSchema,
            },
            handler: async (args) => {
              const parsed = callToolInputSchema.safeParse(args);
              if (!parsed.success) {
                return jsonError({ error: parsed.error.flatten() });
              }
              const { name: innerName, arguments: innerArgs } = parsed.data;
              if (!toolMap.has(innerName)) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `Tool not found: ${innerName}. Use GATEWAY_SEARCH_TOOLS to find available tools.`,
                    },
                  ],
                  isError: true,
                };
              }
              return cache.callTool(innerName, innerArgs);
            },
          },
        ];

        const handlers = new Map(
          toolsWithHandlers.map((t) => [t.tool.name, t.handler]),
        );
        const tools = toolsWithHandlers.map((t) => t.tool);

        return { tools, handlers, filteredTools };
      });
    }
    return this._toolsCache;
  }

  override async listTools(): Promise<ListToolsResult> {
    const { tools } = await this.createTools();
    return { tools };
  }

  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    const { handlers } = await this.createTools();
    const handler = handlers.get(params.name);
    if (!handler) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown meta-tool: ${params.name}. Available: ${Array.from(handlers.keys()).join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    return handler(params.arguments ?? {});
  }

  override async callStreamableTool(): Promise<Response> {
    throw new Error("Meta-tools do not support streaming");
  }
}

/**
 * Code execution client - exposes meta-tools for code execution
 */
export class VirtualMCPCodeExecutionClient extends VirtualMCPPassthroughClient {
  private _toolsCache: Promise<{
    tools: Tool[];
    handlers: Map<string, ToolHandler>;
  }> | null = null;

  private async createTools() {
    if (!this._toolsCache) {
      this._toolsCache = this._toolCache.then((cache) => {
        // Filter out CODE_EXECUTION_* tools to avoid duplication
        const filteredTools = filterCodeExecutionTools(cache.tools);

        const toolsWithHandlers: ToolWithHandler[] = [
          // Shared discovery tools
          ...createDiscoveryMetaTools(filteredTools, cache.categories),
          // Run code tool
          {
            tool: {
              name: "GATEWAY_RUN_CODE",
              description:
                'Run JavaScript code in a sandbox. Code must be an ES module that `export default`s an async function that receives (tools) as its first parameter. Use GATEWAY_DESCRIBE_TOOLS to understand the input/output schemas for a tool before calling it. Use `await tools.toolName(args)` or `await tools["tool-name"](args)` to call tools.',
              inputSchema: RUN_CODE_INPUT_JSON_SCHEMA,
            },
            handler: async (args) => {
              const parsed = RUN_CODE_INPUT_SCHEMA.safeParse(args);
              if (!parsed.success) {
                return jsonError({ error: parsed.error.flatten() });
              }
              // Create tool context for runCodeWithTools
              const toolContext: ToolContext = {
                tools: filteredTools,
                callTool: cache.callTool,
                categories: cache.categories,
              };
              const result = await runCodeWithTools(
                parsed.data.code,
                toolContext,
                parsed.data.timeoutMs,
              );
              if (result.error) {
                return jsonError(result);
              }
              return jsonResult(result);
            },
          },
        ];

        const handlers = new Map(
          toolsWithHandlers.map((t) => [t.tool.name, t.handler]),
        );
        const tools = toolsWithHandlers.map((t) => t.tool);

        return { tools, handlers };
      });
    }
    return this._toolsCache;
  }

  override async listTools(): Promise<ListToolsResult> {
    const { tools } = await this.createTools();
    return { tools };
  }

  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    const { handlers } = await this.createTools();
    const handler = handlers.get(params.name);
    if (!handler) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown meta-tool: ${params.name}. Available: ${Array.from(handlers.keys()).join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    return handler(params.arguments ?? {});
  }

  override async callStreamableTool(): Promise<Response> {
    throw new Error("Meta-tools do not support streaming");
  }
}
