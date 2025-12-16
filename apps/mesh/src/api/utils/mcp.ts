/**
 * MCP Server Builder
 *
 * A builder pattern wrapper for creating MCP servers with middleware support.
 * Inspired by the patterns in @deco/api
 *
 * ## Architecture
 *
 * Single server approach - middleware wraps tool handlers directly.
 * No two-server delegation needed (avoids transport layer issues).
 *
 * ### How it works:
 * 1. Tools are registered with the MCP server
 * 2. Each tool handler is wrapped with the middleware pipeline
 * 3. When a tool is called:
 *    - Middleware runs (pre-processing)
 *    - Tool handler executes via next()
 *    - Middleware continues (post-processing)
 * 4. list_tools is manually implemented with Zod -> JSON Schema conversion
 *
 * ### Why single server?
 *
 * Previous approach used two MCP servers:
 * - Server A: registered tools
 * - Server B: middleware that delegates to Server A via transport
 *
 * This caused issues because:
 * - Transport layer isn't designed for server-to-server communication
 * - Extra overhead and complexity
 * - Harder to debug
 *
 * New approach:
 * - Single MCP server
 * - Middleware wraps handlers directly (no transport needed)
 * - Cleaner, more efficient, easier to understand
 *
 * ## Usage
 *
 * ```ts
 * const server = mcpServer({ name: 'my-server', version: '1.0.0' })
 *   .withTool(myTool)
 *   .withTool(anotherTool)
 *   .callToolMiddleware(authMiddleware);
 *
 * // Use in Hono routes
 * app.post('/mcp', async (c) => server.fetch(c.req.raw));
 * ```
 */

import type { ServerClient } from "@decocms/bindings/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ListToolsResult,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";
import {
  type CallToolRequest,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import z from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { HttpServerTransport } from "../http-server-transport";
import { compose } from "./compose";

// ============================================================================
// Types
// ============================================================================

/**
 * Tool definition compatible with builder pattern
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  annotations?: {
    [key: string]: unknown;
  };
}

/**
 * Middleware for intercepting call tool requests
 * Wraps tool execution, allowing pre and post processing
 *
 * The middleware can:
 * 1. Inspect/modify the request before calling next()
 * 2. Execute the tool by calling next()
 * 3. Inspect/modify the result after next() returns
 *
 * @example
 * ```ts
 * const loggingMiddleware: CallToolMiddleware = async (request, next) => {
 *   console.log('Before:', request.params.name);
 *   const result = await next(); // Tool executes here
 *   console.log('After:', result);
 *   return result;
 * };
 * ```
 */
export type CallToolMiddleware = (
  request: CallToolRequest,
  next: () => Promise<CallToolResult>,
) => Promise<CallToolResult>;

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
  name: string;
  version: string;
  capabilities?: ServerCapabilities;
}

// ============================================================================
// MCP Server Builder
// ============================================================================

/**
 * Builder class for creating MCP servers with middleware support
 */
class McpServerBuilder {
  private config: McpServerConfig;
  private tools: ToolDefinition[] = [];
  private callToolMiddlewares: CallToolMiddleware[] = [];

  constructor(config: McpServerConfig) {
    this.config = {
      ...config,
      capabilities: config.capabilities ?? { tools: {} },
    };
  }

  /**
   * Add a tool to the server
   */
  withTool(tool: ToolDefinition): this {
    this.tools.push(tool);
    return this;
  }

  /**
   * Add multiple tools to the server
   */
  withTools(tools: ToolDefinition[]): this {
    this.tools.push(...tools);
    return this;
  }

  /**
   * Add middleware for call tool requests
   * Middleware runs AFTER tool execution
   */
  callToolMiddleware(...middlewares: CallToolMiddleware[]): this {
    this.callToolMiddlewares.push(...middlewares);
    return this;
  }

  /**
   * Build the final server with all tools and middlewares
   */
  build(): ServerClient & { fetch: (req: Request) => Promise<Response> } {
    // Compose middlewares once
    const callToolPipeline =
      this.callToolMiddlewares.length > 0
        ? compose(...this.callToolMiddlewares)
        : null;

    const createServer = () => {
      // Create single MCP server
      const server = new McpServer(
        { name: this.config.name, version: this.config.version },
        { capabilities: this.config.capabilities },
      );

      // Register all tools with middleware-wrapped handlers
      for (const tool of this.tools) {
        // Base handler that executes the tool
        const baseHandler = async (
          args: Record<string, unknown>,
        ): Promise<CallToolResult> => {
          try {
            const result = await tool.handler(args);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result),
                },
              ],
              structuredContent: result as { [x: string]: unknown } | undefined,
            };
          } catch (error) {
            const err = error as Error;
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: ${err.message}`,
                },
              ],
              isError: true,
            };
          }
        };

        // Wrap handler with middleware if present
        const wrappedHandler = callToolPipeline
          ? async (args: Record<string, unknown>) => {
              // Create a fake request for middleware
              const request: CallToolRequest = {
                method: "tools/call",
                params: {
                  name: tool.name,
                  arguments: args,
                },
              };

              // Run through middleware pipeline
              return await callToolPipeline(request, () => baseHandler(args));
            }
          : baseHandler;

        // Extract the raw shape from the input schema
        const inputSchema =
          "shape" in tool.inputSchema
            ? (tool.inputSchema.shape as z.ZodRawShape)
            : z.object({}).shape;

        const outputSchema =
          tool.outputSchema && "shape" in tool.outputSchema
            ? (tool.outputSchema.shape as z.ZodRawShape)
            : z.object({}).shape;

        // Register tool with wrapped handler
        server.registerTool(
          tool.name,
          {
            annotations: tool.annotations,
            description: tool.description ?? "",
            inputSchema,
            outputSchema,
          },
          wrappedHandler,
        );
      }

      return server;
    };

    // Return the API
    return {
      callStreamableTool: async (
        toolName: string,
        args: Record<string, unknown>,
      ): Promise<Response> => {
        const tool = this.tools.find((t) => t.name === toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
        }
        const result = await tool.handler(args);
        if (!(result instanceof Response)) {
          throw new Error(`Tool ${toolName} returned a non-response`);
        }
        return result;
      },
      client: {
        listTools: async (): Promise<ListToolsResult> => {
          return {
            tools: this.tools.map((t) => ({
              name: t.name,
              description: t.description ?? "",
              inputSchema: zodToJsonSchema(t.inputSchema),
              outputSchema: t.outputSchema
                ? zodToJsonSchema(t.outputSchema)
                : undefined,
            })),
          } as ListToolsResult;
        },
        callTool: async (
          req: CallToolRequest["params"],
        ): Promise<CallToolResult> => {
          const tool = this.tools.find((t) => t.name === req.name);
          if (!tool) {
            return {
              content: [
                {
                  type: "text",
                  text: "Tool not found",
                },
              ],
            };
          }
          try {
            const result = await tool?.handler(req.arguments ?? {});
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result),
                },
              ],
              structuredContent: result as { [x: string]: unknown } | undefined,
            };
          } catch (err) {
            const error = err as Error;
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${error.message}`,
                },
              ],
            };
          }
        },
      },
      /**
       * Handle fetch requests (MCP protocol over HTTP)
       */
      fetch: async (req: Request): Promise<Response> => {
        const transport = new HttpServerTransport();
        await createServer().connect(transport);
        return await transport.handleMessage(req);
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new MCP server builder
 *
 * @example
 * ```ts
 * const server = mcpServer({ name: 'my-server', version: '1.0.0' })
 *   .withTool({
 *     name: 'greet',
 *     description: 'Greet someone',
 *     inputSchema: z.object({ name: z.string() }),
 *     outputSchema: z.object({ greeting: z.string() }),
 *     handler: async (args) => ({ greeting: `Hello, ${args.name}!` })
 *   })
 *   .callToolMiddleware(async (req, next) => {
 *     console.log('Calling tool:', req.params.name);
 *     return next();
 *   });
 *
 * // Use with fetch
 * const response = await server.build().fetch(request);
 * ```
 */
export function mcpServer(config: McpServerConfig): McpServerBuilder {
  return new McpServerBuilder(config);
}

// Re-export types for convenience
export type { McpServerBuilder };
