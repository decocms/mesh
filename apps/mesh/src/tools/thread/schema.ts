/**
 * Thread Schema Definitions
 *
 * Zod schemas for Thread and ThreadMessage entities, following the collection pattern.
 */

import { z } from "zod";

// ============================================================================
// Message Part Schema
// ============================================================================
const MessagePartSchema = z.object({
  type: z.enum(["text", "reasoning", "tool-call", "tool-result"]),
  text: z.string().optional(),
  reasoning: z.string().optional(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  providerExecuted: z.boolean().optional(),
});

export type MessagePart = z.infer<typeof MessagePartSchema>;

// ============================================================================
// Thread Message Schema
// ============================================================================

export const ThreadMessageEntitySchema = z.object({
  id: z.string().describe("Unique message ID"),
  threadId: z.string().describe("ID of the parent thread"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional message metadata"),
  parts: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Message content parts"),
  role: z.enum(["user", "assistant"]).describe("Message role"),
  createdAt: z.union([z.string(), z.date()]).describe("Timestamp of creation"),
  updatedAt: z
    .union([z.string(), z.date()])
    .describe("Timestamp of last update"),
});

export type ThreadMessageEntity = z.infer<typeof ThreadMessageEntitySchema>;

// ============================================================================
// Thread Schema
// ============================================================================

export const ThreadEntitySchema = z.object({
  id: z.string().describe("Unique thread ID"),
  organizationId: z.string().describe("Organization this thread belongs to"),
  title: z.string().describe("Thread title"),
  description: z.string().nullable().describe("Thread description"),
  createdAt: z.union([z.string(), z.date()]).describe("Timestamp of creation"),
  updatedAt: z
    .union([z.string(), z.date()])
    .describe("Timestamp of last update"),
  createdBy: z.string().describe("User ID who created the thread"),
  updatedBy: z
    .string()
    .nullable()
    .describe("User ID who last updated the thread"),
});

export type ThreadEntity = z.infer<typeof ThreadEntitySchema>;

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const ThreadCreateDataSchema = z.object({
  id: z.string().optional().describe("Optional custom ID for the thread"),
  title: z.string().describe("Thread title"),
  description: z.string().nullish().describe("Thread description"),
});

export type ThreadCreateData = z.infer<typeof ThreadCreateDataSchema>;

export const ThreadUpdateDataSchema = z.object({
  title: z.string().optional().describe("New thread title"),
  description: z.string().nullish().describe("New thread description"),
});

export type ThreadUpdateData = z.infer<typeof ThreadUpdateDataSchema>;
