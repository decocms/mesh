/**
 * Gateway Entity Schema
 *
 * Single source of truth for gateway types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

/**
 * Tool selection strategy schema
 * - null: Include selected tools/connections (default behavior, always deduplicates)
 * - "exclusion": Exclude selected tools/connections (inverse filter)
 */
const ToolSelectionStrategySchema = z
  .enum(["exclusion"])
  .nullable()
  .describe(
    "Tool selection strategy: null = include selected (default), 'exclusion' = exclude selected",
  );

export type ToolSelectionStrategy = z.infer<typeof ToolSelectionStrategySchema>;

/**
 * Gateway connection schema - defines which connection and tools are included/excluded
 */
const GatewayConnectionSchema = z.object({
  connection_id: z.string().describe("Connection ID"),
  selected_tools: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected tool names. With null strategy: null = all tools included. With 'exclusion' strategy: null = entire connection excluded",
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
  tool_selection_strategy: ToolSelectionStrategySchema.describe(
    "Strategy for tool selection: null = include selected, 'exclusion' = exclude selected",
  ),
  status: z.enum(["active", "inactive"]).describe("Current status"),
  is_default: z
    .boolean()
    .describe("Whether this is the default gateway for the organization"),

  // Nested connections
  connections: z
    .array(GatewayConnectionSchema)
    .describe(
      "Connections with their selected tools (behavior depends on tool_selection_strategy)",
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
  tool_selection_strategy: ToolSelectionStrategySchema.optional()
    .default(null)
    .describe("Tool selection strategy (defaults to null = include)"),
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
    .describe("Whether this is the default gateway for the organization"),
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
      }),
    )
    .describe(
      "Connections to include/exclude (can be empty for exclusion strategy)",
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
  tool_selection_strategy: ToolSelectionStrategySchema.optional().describe(
    "New tool selection strategy",
  ),
  icon: z.string().nullable().optional().describe("New icon URL (null to clear)"),
  status: z.enum(["active", "inactive"]).optional().describe("New status"),
  is_default: z
    .boolean()
    .optional()
    .describe("Set as default gateway for the organization"),
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
      }),
    )
    .optional()
    .describe("New connections (replaces existing)"),
});

export type GatewayUpdateData = z.infer<typeof GatewayUpdateDataSchema>;
