/**
 * SmartToolSelectionClient
 *
 * Client that exposes meta-tools for dynamic tool discovery:
 * - GATEWAY_SEARCH_TOOLS: Search for tools by name/description
 * - GATEWAY_DESCRIBE_TOOLS: Get detailed schemas for tools
 * - GATEWAY_CALL_TOOL: Execute a tool by name
 */

import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  filterCodeExecutionTools,
  jsonError,
  type ToolWithConnection,
} from "../../tools/code-execution/utils";
import { BaseSelection } from "./base-selection";
import type { VirtualClientOptions } from "./types";

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

/**
 * Client that uses smart tool selection strategy.
 * Extends BaseSelection and adds GATEWAY_CALL_TOOL meta-tool.
 */
export class SmartToolSelectionClient extends BaseSelection {
  constructor(options: VirtualClientOptions, ctx: any) {
    super(options, ctx);
  }

  /**
   * Get the CALL_TOOL meta-tool definition
   */
  private async getCallTool(): Promise<Tool> {
    const cache = await this._cachedTools;
    // Filter out CODE_EXECUTION_* tools to avoid duplication
    const filteredTools = filterCodeExecutionTools(cache.data);
    const toolNames = filteredTools.map((t: ToolWithConnection) => t.name);
    const { jsonSchema } = getCallToolSchema(toolNames);

    return {
      name: "GATEWAY_CALL_TOOL",
      description:
        "Execute a tool by name. Use GATEWAY_DESCRIBE_TOOLS first to understand the input schema.",
      inputSchema: jsonSchema,
      annotations: {
        title: "Call Tool",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  /**
   * Handle CALL_TOOL call
   */
  private async handleCallTool(
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const cache = await this._cachedTools;
    // Filter out CODE_EXECUTION_* tools to avoid duplication
    const filteredTools = filterCodeExecutionTools(cache.data);
    const toolNames = filteredTools.map((t: ToolWithConnection) => t.name);
    const { schema: inputSchema } = getCallToolSchema(toolNames);

    const parsed = inputSchema.safeParse(args);
    if (!parsed.success) {
      return jsonError({ error: parsed.error.flatten() });
    }

    const { name: innerName, arguments: innerArgs } = parsed.data;

    // Check if tool exists in filtered tools
    const toolMap = new Map(
      filteredTools.map((t: ToolWithConnection) => [t.name, t]),
    );
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

    // Route to PassthroughClient's callTool which handles the actual tool execution
    return this.routeToolCall({ name: innerName, arguments: innerArgs });
  }

  /**
   * List tools - returns SEARCH, DESCRIBE, and CALL_TOOL meta-tools
   */
  override async listTools(): Promise<ListToolsResult> {
    const parentTools = await super.listTools();
    const callTool = await this.getCallTool();
    return {
      tools: [...parentTools.tools, callTool],
    };
  }

  /**
   * Call tool - handles CALL_TOOL and delegates to parent for SEARCH/DESCRIBE
   */
  override async callTool(
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> {
    if (params.name === "GATEWAY_CALL_TOOL") {
      return this.handleCallTool(params.arguments ?? {});
    }
    // Delegate to BaseSelection for SEARCH and DESCRIBE
    return super.callTool(params);
  }
}
