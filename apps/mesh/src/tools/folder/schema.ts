/**
 * Folder Entity Schema
 *
 * Single source of truth for folder types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

/**
 * Folder type - determines what kind of items can be in the folder
 */
export const FolderTypeSchema = z.enum(["connections", "gateways"]);
export type FolderType = z.infer<typeof FolderTypeSchema>;

/**
 * Folder entity schema - single source of truth
 * Compliant with collections binding pattern
 */
export const FolderEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the folder"),
  type: FolderTypeSchema.describe("Type of items this folder contains"),
  title: z.string().describe("Human-readable name for the folder"),
  description: z.string().nullable().describe("Description of the folder"),
  icon: z.string().nullable().describe("Icon URL or emoji for the folder"),
  color: z.string().nullable().describe("Color for the folder (hex or name)"),
  sort_order: z.number().describe("Sort order for display"),
  created_at: z.string().describe("When the folder was created"),
  updated_at: z.string().describe("When the folder was last updated"),
  created_by: z.string().describe("User ID who created the folder"),

  // Folder-specific fields
  organization_id: z
    .string()
    .describe("Organization ID this folder belongs to"),
});

/**
 * The folder entity type
 */
export type FolderEntity = z.infer<typeof FolderEntitySchema>;

/**
 * Input schema for creating folders
 */
export const FolderCreateDataSchema = z.object({
  type: FolderTypeSchema.describe("Type of items this folder will contain"),
  title: z.string().min(1).max(255).describe("Name for the folder"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Optional description"),
  icon: z.string().nullable().optional().describe("Optional icon URL or emoji"),
  color: z.string().nullable().optional().describe("Optional color"),
  sort_order: z.number().optional().default(0).describe("Sort order"),
});

export type FolderCreateData = z.infer<typeof FolderCreateDataSchema>;

/**
 * Input schema for updating folders
 */
export const FolderUpdateDataSchema = z.object({
  title: z.string().min(1).max(255).optional().describe("New name"),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("New description (null to clear)"),
  icon: z
    .string()
    .nullable()
    .optional()
    .describe("New icon URL or emoji (null to clear)"),
  color: z.string().nullable().optional().describe("New color (null to clear)"),
  sort_order: z.number().optional().describe("New sort order"),
});

export type FolderUpdateData = z.infer<typeof FolderUpdateDataSchema>;
