/**
 * Gateway Entity Schema
 *
 * Single source of truth for gateway types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

/**
 * Gateway mode schema
 * Defines how tools are transformed/filtered when exposed through the gateway
 */
const GatewayModeSchema = z.object({
  type: z
    .enum(["deduplicate", "prefix_all", "custom"])
    .describe(
      "Mode type: deduplicate (remove duplicate tool names), prefix_all (prefix all tools with connectionId::), custom (custom transformation)",
    ),
  config: z
    .record(z.unknown())
    .optional()
    .describe("Optional configuration for the mode"),
});

export type GatewayMode = z.infer<typeof GatewayModeSchema>;

/**
 * Gateway connection schema - defines which connection and tools are included
 */
const GatewayConnectionSchema = z.object({
  connection_id: z.string().describe("Connection ID to include in gateway"),
  selected_tools: z
    .array(z.string())
    .nullable()
    .describe("Selected tool names (null = all tools)"),
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
  mode: GatewayModeSchema.describe(
    "Mode configuration for tool transformation",
  ),
  status: z.enum(["active", "inactive"]).describe("Current status"),

  // Nested connections
  connections: z
    .array(GatewayConnectionSchema)
    .describe("Connections included in this gateway with their selected tools"),
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
  mode: GatewayModeSchema.optional()
    .default({ type: "deduplicate" })
    .describe("Mode configuration (defaults to deduplicate)"),
  status: z
    .enum(["active", "inactive"])
    .optional()
    .default("active")
    .describe("Initial status"),
  connections: z
    .array(
      z.object({
        connection_id: z.string().describe("Connection ID to include"),
        selected_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe("Selected tool names (null/undefined = all tools)"),
      }),
    )
    .describe("At least one connection is required"),
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
  mode: GatewayModeSchema.optional().describe("New mode configuration"),
  status: z.enum(["active", "inactive"]).optional().describe("New status"),
  connections: z
    .array(
      z.object({
        connection_id: z.string().describe("Connection ID to include"),
        selected_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe("Selected tool names (null/undefined = all tools)"),
      }),
    )
    .optional()
    .describe("New connections (replaces existing)"),
});

export type GatewayUpdateData = z.infer<typeof GatewayUpdateDataSchema>;
