/**
 * Gateway Entity Schema
 *
 * Single source of truth for gateway types.
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
 * Gateway tool selection strategy schema (metadata, not used for runtime behavior yet)
 * - "passthrough": Pass tools through as-is (default)
 * - "smart_tool_selection": Smart tool selection behavior
 * - "code_execution": Code execution behavior
 */
const GatewayToolSelectionStrategySchema = z
  .enum(["passthrough", "smart_tool_selection", "code_execution"])
  .describe(
    "Gateway tool selection strategy: 'passthrough' (default), 'smart_tool_selection', or 'code_execution'",
  );

export type GatewayToolSelectionStrategy = z.infer<
  typeof GatewayToolSelectionStrategySchema
>;

/**
 * Gateway connection schema - defines which connection and tools/resources/prompts are included/excluded
 */
const GatewayConnectionSchema = z.object({
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

export type GatewayConnection = z.infer<typeof GatewayConnectionSchema>;

/**
 * Gateway entity schema - single source of truth
 * Compliant with collections binding pattern
 */
export const GatewayEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the gateway"),
  title: z.string().describe("Human-readable name for the gateway"),
  description: z.string().nullable().describe("Description of the gateway"),
  icon: z.string().nullable().optional().describe("Icon URL for the gateway"),
  created_at: z.string().describe("When the gateway was created"),
  updated_at: z.string().describe("When the gateway was last updated"),
  created_by: z.string().describe("User ID who created the gateway"),
  updated_by: z
    .string()
    .optional()
    .describe("User ID who last updated the gateway"),

  // Gateway-specific fields
  organization_id: z
    .string()
    .describe("Organization ID this gateway belongs to"),
  tool_selection_strategy: GatewayToolSelectionStrategySchema.describe(
    "Gateway behavior strategy (metadata for now): 'passthrough', 'smart_tool_selection', or 'code_execution'",
  ),
  tool_selection_mode: ToolSelectionModeSchema.describe(
    "Tool selection mode: 'inclusion' = include selected, 'exclusion' = exclude selected",
  ),
  status: z.enum(["active", "inactive"]).describe("Current status"),
  is_default: z
    .boolean()
    .describe("Whether this is the Organization Agent for the organization"),

  // Nested connections
  connections: z
    .array(GatewayConnectionSchema)
    .describe(
      "Connections with their selected tools (behavior depends on tool_selection_mode)",
    ),
});

/**
 * The gateway entity type
 */
export type GatewayEntity = z.infer<typeof GatewayEntitySchema>;

/**
 * Input schema for creating gateways
 */
export const GatewayCreateDataSchema = z.object({
  title: z.string().min(1).max(255).describe("Name for the gateway"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Optional description"),
  tool_selection_strategy: GatewayToolSelectionStrategySchema.optional()
    .default("passthrough")
    .describe("Gateway behavior strategy (defaults to 'passthrough')"),
  tool_selection_mode: ToolSelectionModeSchema.optional()
    .default("inclusion")
    .describe("Tool selection mode (defaults to 'inclusion')"),
  icon: z.string().nullable().optional().describe("Optional icon URL"),
  status: z
    .enum(["active", "inactive"])
    .optional()
    .default("active")
    .describe("Initial status"),
  is_default: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether this is the Organization Agent for the organization"),
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

export type GatewayCreateData = z.infer<typeof GatewayCreateDataSchema>;

/**
 * Input schema for updating gateways
 */
export const GatewayUpdateDataSchema = z.object({
  title: z.string().min(1).max(255).optional().describe("New name"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("New description (null to clear)"),
  tool_selection_strategy:
    GatewayToolSelectionStrategySchema.optional().describe(
      "New gateway behavior strategy",
    ),
  tool_selection_mode: ToolSelectionModeSchema.optional().describe(
    "New tool selection mode",
  ),
  icon: z
    .string()
    .nullable()
    .optional()
    .describe("New icon URL (null to clear)"),
  status: z.enum(["active", "inactive"]).optional().describe("New status"),
  is_default: z
    .boolean()
    .optional()
    .describe("Set as Organization Agent for the organization"),
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

export type GatewayUpdateData = z.infer<typeof GatewayUpdateDataSchema>;
