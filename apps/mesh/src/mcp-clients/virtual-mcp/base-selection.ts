/**
 * BaseSelection
 *
 * Base class for tool selection strategies that provides SEARCH and DESCRIBE tools.
 * Extends PassthroughClient and adds meta-tools for tool discovery.
 */

import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  describeTools,
  filterCodeExecutionTools,
  jsonError,
  jsonResult,
  searchTools,
  type ToolWithConnection,
} from "../../tools/code-execution/utils";
import { PassthroughClient } from "./passthrough-client";
import type { VirtualClientOptions } from "./types";

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

/**
 * Base class for tool selection strategies.
 * Provides SEARCH and DESCRIBE meta-tools for tool discovery.
 */
export class BaseSelection extends PassthroughClient {
  constructor(options: VirtualClientOptions, ctx: any) {
    super(options, ctx);
  }

  /**
   * Get the search tool definition with dynamic description
   */
  private getSearchTool(totalTools: number): Tool {
    return {
      name: "GATEWAY_SEARCH_TOOLS",
      description: `Search for available tools by name or description. Returns tool names and brief descriptions without full schemas. Use this to discover tools before calling GATEWAY_DESCRIBE_TOOLS for detailed schemas. Total tools: ${totalTools}.`,
      inputSchema: SEARCH_INPUT_JSON_SCHEMA,
      annotations: {
        title: "Search Tools",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    };
  }

  /**
   * Get the describe tool definition
   */
  private getDescribeTool(): Tool {
    return {
      name: "GATEWAY_DESCRIBE_TOOLS",
      description:
        "Get detailed schemas for specific tools. Call after GATEWAY_SEARCH_TOOLS to get full input/output schemas.",
      inputSchema: DESCRIBE_INPUT_JSON_SCHEMA,
      annotations: {
        title: "Describe Tools",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    };
  }

  /**
   * Handle SEARCH_TOOLS call
   */
  private async handleSearch(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const parsed = SEARCH_INPUT_SCHEMA.safeParse(args);
    if (!parsed.success) {
      return jsonError({ error: parsed.error.flatten() });
    }

    const cache = await this._cachedTools;
    // Filter out CODE_EXECUTION_* tools to avoid duplication
    const filteredTools = filterCodeExecutionTools(cache.data);

    // Use shared search logic
    const results = searchTools(
      parsed.data.query,
      filteredTools,
      parsed.data.limit,
    );
    return jsonResult({
      query: parsed.data.query,
      results: results.map((t: ToolWithConnection) => ({
        name: t.name,
        description: t.description,
        connection: t._meta.connectionTitle,
      })),
      totalAvailable: filteredTools.length,
    });
  }

  /**
   * Handle DESCRIBE_TOOLS call
   */
  private async handleDescribe(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const parsed = DESCRIBE_INPUT_SCHEMA.safeParse(args);
    if (!parsed.success) {
      return jsonError({ error: parsed.error.flatten() });
    }

    const cache = await this._cachedTools;
    // Filter out CODE_EXECUTION_* tools to avoid duplication
    const filteredTools = filterCodeExecutionTools(cache.data);

    // Use shared describe logic
    const result = describeTools(parsed.data.tools, filteredTools);
    return jsonResult({
      tools: result.tools,
      notFound: result.notFound,
    });
  }

  /**
   * List tools - returns SEARCH and DESCRIBE meta-tools
   */
  override async listTools(): Promise<ListToolsResult> {
    const cache = await this._cachedTools;
    // Filter out CODE_EXECUTION_* tools to avoid duplication
    const filteredTools = filterCodeExecutionTools(cache.data);

    return {
      tools: [this.getSearchTool(filteredTools.length), this.getDescribeTool()],
    };
  }

  /**
   * Call tool - handles SEARCH and DESCRIBE meta-tools
   */
  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    if (params.name === "GATEWAY_SEARCH_TOOLS") {
      return this.handleSearch(params.arguments ?? {});
    }
    if (params.name === "GATEWAY_DESCRIBE_TOOLS") {
      return this.handleDescribe(params.arguments ?? {});
    }

    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${params.name}. Available: GATEWAY_SEARCH_TOOLS, GATEWAY_DESCRIBE_TOOLS`,
        },
      ],
      isError: true,
    };
  }

  /**
   * Protected method to route tool calls to the underlying PassthroughClient.
   * Used by subclasses to execute actual tools (not meta-tools).
   * This bypasses BaseSelection's callTool override and calls PassthroughClient.callTool directly.
   */
  protected async routeToolCall(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    // Call PassthroughClient.callTool directly, bypassing BaseSelection's override
    return PassthroughClient.prototype.callTool.call(this, params);
  }
}
