/**
 * Project Tools Schema
 *
 * Shared zod schemas for project management tools.
 */

import { z } from "zod";

/**
 * Project UI customization schema
 * All fields are required but nullable to match the ProjectUI type
 */
const projectUISchema = z.object({
  banner: z.string().nullable(),
  bannerColor: z.string().nullable(),
  icon: z.string().nullable(),
  themeColor: z.string().nullable(),
});

/**
 * Partial project UI schema for input (all fields optional)
 */
export const partialProjectUISchema = z.object({
  banner: z.string().nullable().optional(),
  bannerColor: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  themeColor: z.string().nullable().optional(),
});

/**
 * Bound connection summary schema (for display in project cards)
 */
export const boundConnectionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
});

/**
 * Serialized project schema for API responses
 */
export const serializedProjectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  enabledPlugins: z.array(z.string()).nullable(),
  ui: projectUISchema.nullable(),
  createdAt: z.string().datetime().describe("ISO 8601 timestamp"),
  updatedAt: z.string().datetime().describe("ISO 8601 timestamp"),
});

/**
 * Serialized project with bound connections (for list responses)
 */
export const serializedProjectWithBindingsSchema = serializedProjectSchema
  .omit({ organizationId: true })
  .extend({
    boundConnections: z.array(boundConnectionSummarySchema),
  });

/**
 * Serialized project plugin config schema for API responses
 */
export const serializedPluginConfigSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  pluginId: z.string(),
  connectionId: z.string().nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime().describe("ISO 8601 timestamp"),
  updatedAt: z.string().datetime().describe("ISO 8601 timestamp"),
});
