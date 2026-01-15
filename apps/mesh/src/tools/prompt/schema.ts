/**
 * Prompt Entity Schema
 *
 * Single source of truth for stored prompt types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";
import {
  PromptArgumentSchema,
  PromptIconSchema,
  PromptMessageSchema,
} from "@decocms/bindings/prompt";

export const PromptEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the prompt"),
  title: z.string().describe("Human-readable title for the prompt"),
  description: z.string().nullable().describe("Description of the prompt"),
  created_at: z.string().describe("When the prompt was created"),
  updated_at: z.string().describe("When the prompt was last updated"),
  created_by: z.string().describe("User ID who created the prompt"),
  updated_by: z
    .string()
    .optional()
    .describe("User ID who last updated the prompt"),

  // Prompt-specific fields
  organization_id: z
    .string()
    .describe("Organization ID this prompt belongs to"),
  name: z.string().describe("Prompt name (MCP identifier)"),
  template: z
    .string()
    .nullable()
    .optional()
    .describe("Mustache template content for this prompt"),
  arguments: z
    .array(PromptArgumentSchema)
    .optional()
    .describe("Explicit variables for template usage"),
  icons: z.array(PromptIconSchema).optional(),
  messages: z.array(PromptMessageSchema).optional(),
});

export type PromptEntity = z.infer<typeof PromptEntitySchema>;

export const PromptCreateDataSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  template: z.string().nullable().optional(),
  arguments: z.array(PromptArgumentSchema).optional(),
  icons: z.array(PromptIconSchema).optional(),
  messages: z.array(PromptMessageSchema).optional(),
});

export type PromptCreateData = z.infer<typeof PromptCreateDataSchema>;

export const PromptUpdateDataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  template: z.string().nullable().optional(),
  arguments: z.array(PromptArgumentSchema).optional(),
  icons: z.array(PromptIconSchema).optional(),
  messages: z.array(PromptMessageSchema).optional(),
});

export type PromptUpdateData = z.infer<typeof PromptUpdateDataSchema>;
