/**
 * Decopilot Conversation Processing
 *
 * Handles message processing, memory loading, and conversation state management.
 */

import type { MeshContext } from "@/core/mesh-context";
import { ChatModelConfig } from "@/web/components/chat/types";
import {
  convertToModelMessages,
  pruneMessages,
  SystemModelMessage,
  validateUIMessages,
} from "ai";
import type { ChatMessage } from "./types";
import { HTTPException } from "hono/http-exception";
import { ensureUser } from "./helpers";
import { createMemory } from "./memory";
import type { Memory } from "./types";

export interface ProcessedConversation {
  memory: Memory;
  systemMessages: SystemModelMessage[];
  prunedMessages: ReturnType<typeof pruneMessages>;
  originalMessages: ChatMessage[];
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
    messages: ChatMessage[];
    systemPrompts: string[];
    model: ChatModelConfig;
  },
): Promise<ProcessedConversation> {
  const userId = ensureUser(ctx);

  const modelHasVision = config.model.capabilities?.vision ?? true;

  // Create or load memory
  const memory = await createMemory(ctx.storage.threads, {
    organizationId: config.organizationId,
    threadId: config.threadId,
    userId,
    defaultWindowSize: config.windowSize,
  });

  // Load thread history
  const threadMessages = await memory.loadHistory();

  // ID-based merge: replace thread messages with config versions when ids match (client has updated, e.g. tool result)
  const configById = new Map(
    config.messages.map((m) => [m.id ?? crypto.randomUUID(), m]),
  );
  const merged = threadMessages.map((m) => configById.get(m.id) ?? m);
  const threadIds = new Set(threadMessages.map((m) => m.id));
  const appended = config.messages.filter((m) => !threadIds.has(m.id));
  const allMessages = [...merged, ...appended];

  // Check if messages contain files when model doesn't support vision
  if (!modelHasVision) {
    const hasFiles = allMessages.some((message) =>
      message.parts?.some((part) => part.type === "file"),
    );
    if (hasFiles) {
      throw new HTTPException(400, {
        message:
          "This model does not support file uploads. Please change the model and try again.",
      });
    }
  }

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
    toolCalls: "all",
  }).slice(-config.windowSize);

  return {
    memory,
    systemMessages,
    prunedMessages,
    originalMessages: validatedMessages as ChatMessage[],
  };
}
