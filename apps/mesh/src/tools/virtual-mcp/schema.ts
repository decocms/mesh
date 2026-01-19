/**
 * Virtual MCP Entity Schema
 *
 * Single source of truth for virtual MCP types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

/**
 * Tool selection mode schema
 * - "inclusion": Include selected tools/connections (default behavior)
 * - "exclusion": Exclude selected tools/connections (inverse filter)
 */
const ToolSelectionModeSchema = z
  .enum(["inclusion", "exclusion"])
  .describe(
    "Tool selection mode: 'inclusion' = include selected (default), 'exclusion' = exclude selected",
  );

export type ToolSelectionMode = z.infer<typeof ToolSelectionModeSchema>;

/**
 * Virtual MCP connection schema - defines which connection and tools/resources/prompts are included/excluded
 */
const VirtualMCPConnectionSchema = z.object({
  connection_id: z.string().describe("Connection ID"),
  selected_tools: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected tool names. With 'inclusion' mode: null = all tools included. With 'exclusion' mode: null = entire connection excluded",
    ),
  selected_resources: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected resource URIs or patterns. Supports * and ** wildcards for pattern matching. With 'inclusion' mode: null = all resources included.",
    ),
  selected_prompts: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected prompt names. With 'inclusion' mode: null = all prompts included. With 'exclusion' mode: null = entire connection excluded.",
    ),
});

export type VirtualMCPConnection = z.infer<typeof VirtualMCPConnectionSchema>;

/**
 * Virtual MCP entity schema - single source of truth
 * Compliant with collections binding pattern
 */
export const VirtualMCPEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the virtual MCP"),
  title: z.string().describe("Human-readable name for the virtual MCP"),
  description: z.string().nullable().describe("Description of the virtual MCP"),
  icon: z
    .string()
    .nullable()
    .optional()
    .describe("Icon URL for the virtual MCP"),
  created_at: z.string().describe("When the virtual MCP was created"),
  updated_at: z.string().describe("When the virtual MCP was last updated"),
  created_by: z.string().describe("User ID who created the virtual MCP"),
  updated_by: z
    .string()
    .optional()
    .describe("User ID who last updated the virtual MCP"),

  // Virtual MCP-specific fields
  organization_id: z
    .string()
    .describe("Organization ID this virtual MCP belongs to"),
  tool_selection_mode: ToolSelectionModeSchema.describe(
    "Tool selection mode: 'inclusion' = include selected, 'exclusion' = exclude selected",
  ),
  status: z.enum(["active", "inactive"]).describe("Current status"),
  // Nested connections
  connections: z
    .array(VirtualMCPConnectionSchema)
    .describe(
      "Connections with their selected tools (behavior depends on tool_selection_mode)",
    ),
});

/**
 * The virtual MCP entity type
 */
export type VirtualMCPEntity = z.infer<typeof VirtualMCPEntitySchema>;

/**
 * Input schema for creating virtual MCPs
 */
export const VirtualMCPCreateDataSchema = z.object({
  title: z.string().min(1).max(255).describe("Name for the virtual MCP"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Optional description"),
  tool_selection_mode: ToolSelectionModeSchema.optional()
    .default("inclusion")
    .describe("Tool selection mode (defaults to 'inclusion')"),
  icon: z.string().nullable().optional().describe("Optional icon URL"),
  status: z
    .enum(["active", "inactive"])
    .optional()
    .default("active")
    .describe("Initial status"),
  connections: z
    .array(
      z.object({
        connection_id: z.string().describe("Connection ID"),
        selected_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Selected tool names (null/undefined = all tools or full exclusion)",
          ),
        selected_resources: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Selected resource URIs or patterns with * and ** wildcards (null/undefined = all resources)",
          ),
        selected_prompts: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Selected prompt names (null/undefined = all prompts or full exclusion)",
          ),
      }),
    )
    .describe(
      "Connections to include/exclude (can be empty for exclusion mode)",
    ),
});

export type VirtualMCPCreateData = z.infer<typeof VirtualMCPCreateDataSchema>;

/**
 * Input schema for updating virtual MCPs
 */
export const VirtualMCPUpdateDataSchema = z.object({
  title: z.string().min(1).max(255).optional().describe("New name"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("New description (null to clear)"),
  tool_selection_mode: ToolSelectionModeSchema.optional().describe(
    "New tool selection mode",
  ),
  icon: z
    .string()
    .nullable()
    .optional()
    .describe("New icon URL (null to clear)"),
  status: z.enum(["active", "inactive"]).optional().describe("New status"),
  connections: z
    .array(
      z.object({
        connection_id: z.string().describe("Connection ID"),
        selected_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Selected tool names (null/undefined = all tools or full exclusion)",
          ),
        selected_resources: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Selected resource URIs or patterns with * and ** wildcards (null/undefined = all resources)",
          ),
        selected_prompts: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Selected prompt names (null/undefined = all prompts or full exclusion)",
          ),
      }),
    )
    .optional()
    .describe("New connections (replaces existing)"),
});

export type VirtualMCPUpdateData = z.infer<typeof VirtualMCPUpdateDataSchema>;
