/**
 * Decopilot Conversation Processing
 *
 * Handles message processing, memory loading, and conversation state management.
 */

import {
  convertToModelMessages,
  pruneMessages,
  SystemModelMessage,
  UIMessage,
  validateUIMessages,
} from "ai";
import { HTTPException } from "hono/http-exception";

import type { MeshContext } from "@/core/mesh-context";
import { ensureUser } from "./helpers";
import { createMemory } from "./memory";
import type { Memory } from "./types";
import { Metadata, ChatModelConfig } from "@/web/components/chat/types";

export interface ProcessedConversation {
  memory: Memory;
  systemMessages: SystemModelMessage[];
  prunedMessages: ReturnType<typeof pruneMessages>;
  originalMessages: UIMessage<Metadata>[];
}

/**
 * Process messages and create/load memory for the conversation
 */
export async function processConversation(
  ctx: MeshContext,
  config: {
    organizationId: string;
    threadId: string | null | undefined;
    windowSize: number;
    messages: UIMessage<Metadata>[];
    systemPrompts: string[];
    model: ChatModelConfig;
  },
): Promise<ProcessedConversation> {
  const userId = ensureUser(ctx);

  const modelHasVision = config.model.capabilities?.vision ?? true;

  // Check if messages contain files when model doesn't support vision
  if (!modelHasVision) {
    const hasFiles = config.messages.some((message) =>
      message.parts?.some((part) => part.type === "file"),
    );
    if (hasFiles) {
      throw new HTTPException(400, {
        message:
          "This model does not support file uploads. Please change the model and try again.",
      });
    }
  }

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
  const mappedMessages = validatedMessages;

  // Convert to model messages
  const modelMessages = await convertToModelMessages(mappedMessages, {
    ignoreIncompleteToolCalls: true,
  });

  // Build system messages from prompts + incoming system messages
  const systemMessages: SystemModelMessage[] = [
    ...config.systemPrompts.map((content) => ({
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
    originalMessages: validatedMessages as unknown as UIMessage<Metadata>[],
  };
}
