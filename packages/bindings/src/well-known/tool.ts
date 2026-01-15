/**
 * Tools Well-Known Binding
 *
 * Defines the interface for stored tools (user-defined MCP tools).
 * These tools are exposed as a collection for CRUD operations.
 */

import { z } from "zod";
import type { Binder } from "../core/binder";
import {
  BaseCollectionEntitySchema,
  createCollectionBindings,
} from "./collections";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";

type JsonSchema = Record<string, unknown>;

const JsonSchemaSchema: z.ZodType<JsonSchema> = z
  .record(z.string(), z.unknown())
  .describe("JSON Schema object");

/**
 * Tool entity schema extending MCP Tool definition with execution metadata.
 */
export const ToolSchema = BaseCollectionEntitySchema.extend({
  name: z.string().describe("Tool name (MCP identifier)"),
  input_schema: JsonSchemaSchema.describe("JSON Schema for tool input"),
  output_schema: JsonSchemaSchema.optional().describe(
    "JSON Schema for tool output",
  ),
  execute: z
    .string()
    .describe(
      "JavaScript code to execute in the QuickJS sandbox. Access tool input via global `input` and call other tools via global `tools`.",
    ),
  dependencies: z
    .array(z.string())
    .describe("Required tool IDs this tool depends on"),
}).describe("Stored tool entity");

export type ToolCollectionEntity = z.infer<typeof ToolSchema>;

/**
 * Helper type to ensure MCP compatibility at the edge.
 */
export type ToolMcpDefinition = McpTool;

/**
 * TOOLS Collection Binding
 *
 * Collection bindings for stored tools.
 */
export const TOOLS_COLLECTION_BINDING = createCollectionBindings(
  "tools",
  ToolSchema,
);

/**
 * TOOLS Binding (CRUD)
 */
export const TOOLS_BINDING = [
  ...TOOLS_COLLECTION_BINDING,
] as const satisfies Binder;
