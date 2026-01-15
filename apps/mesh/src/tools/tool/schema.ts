/**
 * Tool Entity Schema
 *
 * Single source of truth for stored tool types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

type JsonSchema = Record<string, unknown>;
const JsonSchemaSchema: z.ZodType<JsonSchema> = z.record(
  z.string(),
  z.unknown(),
);

export const ToolEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the tool"),
  title: z.string().describe("Human-readable name for the tool"),
  description: z.string().nullable().describe("Description of the tool"),
  created_at: z.string().describe("When the tool was created"),
  updated_at: z.string().describe("When the tool was last updated"),
  created_by: z.string().describe("User ID who created the tool"),
  updated_by: z
    .string()
    .optional()
    .describe("User ID who last updated the tool"),

  // Tool-specific fields
  organization_id: z.string().describe("Organization ID this tool belongs to"),
  name: z.string().describe("Tool name (MCP identifier)"),
  input_schema: JsonSchemaSchema.describe("JSON Schema for tool input"),
  output_schema: JsonSchemaSchema.optional().describe(
    "JSON Schema for tool output",
  ),
  execute: z
    .string()
    .describe(
      "JavaScript code to execute in the QuickJS sandbox. Access input via global `input` and call other tools via global `tools`.",
    ),
  dependencies: z
    .array(z.string())
    .describe("Required tool IDs this tool depends on"),
});

export type ToolEntity = z.infer<typeof ToolEntitySchema>;

export const ToolCreateDataSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  input_schema: JsonSchemaSchema,
  output_schema: JsonSchemaSchema.optional(),
  execute: z.string().min(1),
  dependencies: z.array(z.string()),
});

export type ToolCreateData = z.infer<typeof ToolCreateDataSchema>;

export const ToolUpdateDataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  input_schema: JsonSchemaSchema.optional(),
  output_schema: JsonSchemaSchema.optional(),
  execute: z.string().min(1).optional(),
  dependencies: z.array(z.string()).optional(),
});

export type ToolUpdateData = z.infer<typeof ToolUpdateDataSchema>;
