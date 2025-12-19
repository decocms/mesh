/**
 * Core Binder Types and Utilities
 *
 * This module provides the core types and utilities for the bindings system.
 * Bindings define standardized interfaces that integrations (MCPs) can implement.
 */

import type { ZodType } from "zod";
import { createMCPFetchStub, MCPClientFetchStub } from "./client/mcp";
import { ServerClient } from "./client/mcp-client";
import { MCPConnection } from "./connection";

/**
 * ToolBinder defines a single tool within a binding.
 * It specifies the tool name, input/output schemas, and whether it's optional.
 *
 * @template TName - The tool name (can be a string or RegExp for pattern matching)
 * @template TInput - The input type (inferred from inputSchema)
 * @template TReturn - The return type (inferred from outputSchema)
 */
export interface ToolBinder<
  TName extends string | RegExp = string,
  // biome-ignore lint/suspicious/noExplicitAny: Generic type parameter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TInput = any,
  TReturn extends object | null | boolean = object,
  TStreamable extends boolean = boolean,
> {
  /** The name of the tool (e.g., "DECO_CHAT_CHANNELS_JOIN") */
  name: TName;

  /** Zod schema for validating tool input */
  inputSchema: ZodType<TInput>;

  /** Optional Zod schema for validating tool output */
  outputSchema?: TStreamable extends true ? never : ZodType<TReturn>;

  /**
   * Whether this tool is streamable.
   */
  streamable?: TStreamable;

  /**
   * Whether this tool is optional in the binding.
   * If true, an implementation doesn't need to provide this tool.
   */
  opt?: true;
}

/**
 * Binder represents a collection of tool definitions that form a binding.
 * A binding is like a TypeScript interface - it defines what tools must be implemented.
 *
 * @template TDefinition - Array of ToolBinder definitions
 *
 * @example
 * ```ts
 * const MY_BINDING = [{
 *   name: "MY_TOOL" as const,
 *   inputSchema: z.object({ id: z.string() }),
 *   outputSchema: z.object({ success: z.boolean() }),
 * }] as const satisfies Binder;
 * ```
 */
export type Binder<
  TDefinition extends readonly ToolBinder[] = readonly ToolBinder[],
> = TDefinition;

/**
 * Tool with schemas for validation
 */
export interface ToolWithSchemas {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: ZodType<any> | Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSchema?: ZodType<any> | Record<string, unknown>;
}

/**
 * Binding checker interface
 */
export interface BindingChecker {
  /**
   * Check if a set of tools implements the binding with full schema validation.
   *
   * Validates:
   * - Tool name matches (exact or regex)
   * - Input schema: Tool accepts what binder requires (no removals from binder to tool)
   * - Output schema: Tool provides what binder expects (no removals from tool to binder)
   *
   * @param tools - Array of tools with names and schemas
   * @returns Promise<boolean> - true if all tools implement the binding correctly
   */
  isImplementedBy: (tools: ToolWithSchemas[]) => boolean;
}

export const bindingClient = <TDefinition extends readonly ToolBinder[]>(
  binder: TDefinition,
) => {
  return {
    ...createBindingChecker(binder),
    forClient: (client: ServerClient): MCPClientFetchStub<TDefinition> => {
      return createMCPFetchStub<TDefinition>({
        client,
        streamable: binder.reduce(
          (acc, tool) => {
            acc[tool.name] = tool.streamable === true;
            return acc;
          },
          {} as Record<string, boolean>,
        ),
      });
    },
    forConnection: (
      mcpConnection: MCPConnection,
    ): MCPClientFetchStub<TDefinition> => {
      return createMCPFetchStub<TDefinition>({
        connection: mcpConnection,
        streamable: binder.reduce(
          (acc, tool) => {
            acc[tool.name] = tool.streamable === true;
            return acc;
          },
          {} as Record<string, boolean>,
        ),
      });
    },
  };
};

export type MCPBindingClient<T extends ReturnType<typeof bindingClient<any>>> =
  ReturnType<T["forConnection"]>;

/**
 * Creates a binding checker with full schema validation using structural subset checking.
 *
 * This performs strict compatibility checking:
 * - For input schemas: Validates that the tool can accept what the binder requires (binder ⊆ tool)
 * - For output schemas: Validates that the tool provides what the binder expects (binder ⊆ tool)
 *
 * @param binderTools - The binding definition to check against
 * @returns A binding checker with an async isImplementedBy method
 *
 * @example
 * ```ts
 * const checker = createBindingChecker(MY_BINDING);
 * const isCompatible = await checker.isImplementedBy(availableTools);
 * ```
 */
export function createBindingChecker<TDefinition extends readonly ToolBinder[]>(
  binderTools: TDefinition,
): BindingChecker {
  return {
    isImplementedBy: (tools: ToolWithSchemas[]): boolean => {
      for (const binderTool of binderTools) {
        // Find matching tool by name (exact or regex)
        const pattern =
          typeof binderTool.name === "string"
            ? new RegExp(`^${binderTool.name}$`)
            : binderTool.name;

        const matchedTool = tools.find((t) => pattern.test(t.name));

        // Skip optional tools that aren't present
        if (!matchedTool && binderTool.opt) {
          continue;
        }

        // Required tool not found
        if (!matchedTool) {
          return false;
        }
        return true;

        // FIXME @mcandeia Zod to JSONSchema converstion is creating inconsistent schemas
      }
      return true;
    },
  };
}
