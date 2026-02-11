/**
 * Decopilot Request Schemas
 *
 * Zod validation schemas for Decopilot API requests.
 */

import { z } from "zod";
import { DEFAULT_WINDOW_SIZE } from "./constants";

const UIMessageSchema = z.looseObject({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.unknown().optional(),
});

const MemoryConfigSchema = z.object({
  windowSize: z.number().default(DEFAULT_WINDOW_SIZE),
  threadId: z.string(),
});

export const StreamRequestSchema = z.object({
  messages: z
    .array(UIMessageSchema)
    .min(1)
    .refine((msgs) => msgs.filter((m) => m.role !== "system").length === 1, {
      message: "Expected exactly one non-system message",
    }),
  memory: MemoryConfigSchema.optional(),
  model: z
    .object({
      id: z.string(),
      connectionId: z.string(),
      fastId: z
        .string()
        .optional()
        .nullable()
        .describe("ID of a fast/cheap model for background operations"),
      capabilities: z
        .object({
          vision: z.boolean().optional(),
          text: z.boolean().optional(),
          tools: z.boolean().optional(),
        })
        .optional(),
      provider: z
        .enum([
          "openai",
          "anthropic",
          "google",
          "xai",
          "deepseek",
          "openrouter",
          "openai-compatible",
        ])
        .optional()
        .nullable(),
      limits: z
        .object({
          contextWindow: z.number().optional(),
          maxOutputTokens: z.number().optional(),
        })
        .optional(),
    })
    .loose(),
  agent: z
    .object({
      id: z.string(),
      mode: z.enum(["passthrough", "smart_tool_selection", "code_execution"]),
    })
    .loose(),
  stream: z.boolean().optional(),
  temperature: z.number().default(0.5),
  thread_id: z.string().optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;
