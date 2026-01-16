/**
 * Decopilot Conversation Processing
 *
 * Handles message processing, memory loading, and conversation state management.
 */

import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import {
  convertToModelMessages,
  pruneMessages,
  SystemModelMessage,
  UIMessage,
  validateUIMessages,
} from "ai";

import type { MeshContext } from "@/core/mesh-context";
import { ensureUser } from "./helpers";
import { createMemory } from "./memory";
import type { Agent, Memory } from "./types";

export interface ProcessedConversation {
  memory: Memory;
  systemMessages: SystemModelMessage[];
  prunedMessages: ReturnType<typeof pruneMessages>;
  userMessages: UIMessage<Metadata>[];
  userCreatedAt: string;
}

/**
 * Process messages and create/load memory for the conversation
 */
export async function processConversation(
  ctx: MeshContext,
  agent: Agent,
  config: {
    organizationId: string;
    threadId: string | null | undefined;
    windowSize: number;
    messages: UIMessage<Metadata>[];
  },
): Promise<ProcessedConversation> {
  const userId = ensureUser(ctx);

  // Create or load memory
  const memory = await createMemory(ctx.storage.threads, {
    organizationId: config.organizationId,
    threadId: config.threadId,
    userId,
    defaultWindowSize: config.windowSize,
  });

  // Load thread history
  const threadMessages = await memory.loadHistory();

  const allMessages = [...threadMessages, ...config.messages];
  const validatedMessages = await validateUIMessages({ messages: allMessages });

  // Convert to model messages
  const modelMessages = await convertToModelMessages(validatedMessages, {
    ignoreIncompleteToolCalls: true,
  });

  const userCreatedAt = new Date().toISOString();

  // Extract user messages
  const userMessages = modelMessages.filter(
    (m) => m.role === "user",
  ) as unknown as UIMessage<Metadata>[];

  // Build system messages from agent prompts + incoming system messages
  const systemMessages: SystemModelMessage[] = [
    ...agent.systemPrompts.map((content) => ({
      role: "system" as const,
      content,
    })),
    ...(modelMessages.filter(
      (m) => m.role === "system",
    ) as SystemModelMessage[]),
  ];

  // Filter and prune non-system messages
  const nonSystemMessages = modelMessages.filter((m) => m.role !== "system");
  const prunedMessages = pruneMessages({
    messages: nonSystemMessages,
    reasoning: "before-last-message",
    emptyMessages: "remove",
    toolCalls: "none",
  }).slice(-config.windowSize);

  return {
    memory,
    systemMessages,
    prunedMessages,
    userMessages,
    userCreatedAt,
  };
}
