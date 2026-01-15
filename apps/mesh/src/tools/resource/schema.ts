/**
 * Resource Entity Schema
 *
 * Single source of truth for stored resource types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

export const ResourceEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the resource"),
  title: z.string().describe("Human-readable title for the resource"),
  description: z.string().nullable().describe("Description of the resource"),
  created_at: z.string().describe("When the resource was created"),
  updated_at: z.string().describe("When the resource was last updated"),
  created_by: z.string().describe("User ID who created the resource"),
  updated_by: z
    .string()
    .optional()
    .describe("User ID who last updated the resource"),

  // Resource-specific fields
  organization_id: z
    .string()
    .describe("Organization ID this resource belongs to"),
  uri: z.string().describe("Resource URI"),
  name: z.string().describe("Resource name"),
  mime_type: z.string().nullable().optional().describe("MIME type"),
  text: z.string().nullable().optional().describe("Text payload"),
  blob: z.string().nullable().optional().describe("Base64 payload"),
});

export type ResourceEntity = z.infer<typeof ResourceEntitySchema>;

export const ResourceCreateDataSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  uri: z.string().min(1),
  name: z.string().min(1).max(255),
  mime_type: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  blob: z.string().nullable().optional(),
});

export type ResourceCreateData = z.infer<typeof ResourceCreateDataSchema>;

export const ResourceUpdateDataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  uri: z.string().min(1).optional(),
  name: z.string().min(1).max(255).optional(),
  mime_type: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  blob: z.string().nullable().optional(),
});

export type ResourceUpdateData = z.infer<typeof ResourceUpdateDataSchema>;
