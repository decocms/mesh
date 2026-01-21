/**
 * Decopilot Request Schemas
 *
 * Zod validation schemas for Decopilot API requests.
 */

import { z } from "zod";

const UIMessageSchema = z.looseObject({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.unknown().optional(),
});

const MemoryConfigSchema = z.object({
  windowSize: z.number().optional(),
  threadId: z.string(),
});

export const StreamRequestSchema = z.object({
  messages: z.array(UIMessageSchema),
  memory: MemoryConfigSchema.optional(),
  model: z
    .object({
      id: z.string(),
      connectionId: z.string(),
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
  gateway: z.object({ id: z.string().nullable() }).loose(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  thread_id: z.string().optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;
