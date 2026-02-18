/**
 * Virtual MCP Entity Schema
 *
 * Single source of truth for virtual MCP types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

/**
 * Virtual MCP connection schema - defines which connection and tools/resources/prompts are included
 */
const VirtualMCPConnectionSchema = z.object({
  connection_id: z.string().describe("Connection ID"),
  selected_tools: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected tool names. null = all tools included, array = only these tools included",
    ),
  selected_resources: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected resource URIs or patterns. Supports * and ** wildcards for pattern matching. null = all resources included, array = only these resources included",
    ),
  selected_prompts: z
    .array(z.string())
    .nullable()
    .describe(
      "Selected prompt names. null = all prompts included, array = only these prompts included",
    ),
});

export type VirtualMCPConnection = z.infer<typeof VirtualMCPConnectionSchema>;

/**
 * Virtual MCP connection schema for input (Create/Update) - fields can be optional
 */
const VirtualMCPConnectionInputSchema = VirtualMCPConnectionSchema.extend({
  selected_tools: VirtualMCPConnectionSchema.shape.selected_tools.optional(),
  selected_resources:
    VirtualMCPConnectionSchema.shape.selected_resources.optional(),
  selected_prompts:
    VirtualMCPConnectionSchema.shape.selected_prompts.optional(),
});

/**
 * Virtual MCP entity schema - single source of truth
 * Compliant with collections binding pattern
 */
export const VirtualMCPEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the virtual MCP"),
  title: z.string().describe("Human-readable name for the virtual MCP"),
  description: z.string().nullable().describe("Description of the virtual MCP"),
  icon: z.string().nullable().describe("Icon URL for the virtual MCP"),
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
  status: z.enum(["active", "inactive"]).describe("Current status"),
  // Metadata (stored in connections.metadata)
  // Normalize null/undefined to { instructions: null } for consistent form tracking
  metadata: z
    .object({
      instructions: z.string().nullable().describe("MCP server instructions"),
    })
    .loose()
    .describe("Additional metadata including MCP server instructions"),
  // Nested connections
  connections: z
    .array(VirtualMCPConnectionSchema)
    .describe("Connections with their selected tools, resources, and prompts"),
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
  icon: z.string().optional().describe("Optional icon URL"),
  status: z
    .enum(["active", "inactive"])
    .optional()
    .default("active")
    .describe("Initial status"),
  metadata: z
    .object({
      instructions: z
        .string()
        .nullable()
        .optional()
        .describe("MCP server instructions"),
    })
    .nullable()
    .optional()
    .describe("Additional metadata including MCP server instructions"),
  connections: z
    .array(VirtualMCPConnectionInputSchema)
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
  icon: z.string().optional().describe("New icon URL"),
  status: z.enum(["active", "inactive"]).optional().describe("New status"),
  metadata: z
    .object({
      instructions: z
        .string()
        .nullable()
        .optional()
        .describe("MCP server instructions"),
    })
    .nullable()
    .optional()
    .describe("Additional metadata including MCP server instructions"),
  connections: z
    .array(VirtualMCPConnectionInputSchema)
    .optional()
    .describe("New connections (replaces existing)"),
});

export type VirtualMCPUpdateData = z.infer<typeof VirtualMCPUpdateDataSchema>;
