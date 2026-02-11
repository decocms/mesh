/**
 * Decopilot Conversation Processing
 *
 * Handles message processing, memory loading, and conversation state management.
 */

import type { ModelsConfig } from "./types";
import {
  convertToModelMessages,
  ModelMessage,
  pruneMessages,
  SystemModelMessage,
  validateUIMessages,
} from "ai";
import type { ChatMessage } from "./types";
import type { Memory } from "./memory";
import { HTTPException } from "hono/http-exception";

export interface ProcessedConversation {
  systemMessages: SystemModelMessage[];
  messages: ReturnType<typeof pruneMessages>;
  originalMessages: ChatMessage[];
}

function splitMessages<T extends ChatMessage>(
  messages: ChatMessage[],
): { systemMessages: ChatMessage[]; messages: ChatMessage[] };
function splitMessages<T extends ModelMessage>(
  messages: ModelMessage[],
): {
  systemMessages: Extract<ModelMessage, { role: "system" }>[];
  messages: Extract<ModelMessage, { role: "user" | "assistant" }>[];
};
function splitMessages<T extends { role: string }>(messages: T[]) {
  const [system, nonSystem] = messages.reduce(
    (acc, m) => {
      if (m.role === "system") acc[0].push(m);
      else acc[1].push(m);
      return acc;
    },
    [[], []] as [T[], T[]],
  );
  return {
    systemMessages: system,
    messages: nonSystem,
  };
}

/**
 * Process messages for the conversation (memory is created externally)
 */
export async function processConversation(
  memory: Memory,
  messages: ChatMessage[],
  instruction: ChatMessage | null | undefined,
  config: { windowSize: number; models: ModelsConfig },
): Promise<ProcessedConversation> {
  const {
    systemMessages,
    messages: [message],
  } = splitMessages(messages);

  if (!message) {
    throw new HTTPException(400, {
      message: "Expected exactly one non-system message",
    });
  }

  // Load thread history
  const threadMessages = await memory.loadHistory(config.windowSize);

  // ID-based merge: if incoming message matches a thread message, replace it and drop the rest; else append
  const matchIndex = threadMessages.findIndex((m) => m.id === message.id);
  const conversation =
    matchIndex >= 0
      ? [...threadMessages.slice(0, matchIndex), message]
      : [...threadMessages, message];

  const allMessages: ChatMessage[] = [
    ...(instruction ? [instruction] : []),
    ...systemMessages,
    ...conversation,
  ];

  const validUIMessages = await validateUIMessages<ChatMessage>({
    messages: allMessages,
  });

  // Convert to model messages
  const modelMessages = await convertToModelMessages(validUIMessages, {
    ignoreIncompleteToolCalls: true,
  });

  const {
    systemMessages: systemModelMessages,
    messages: nonSystemModelMessages,
  } = splitMessages(modelMessages);

  // Build system messages from input systemMessages + system from model (thread history)
  // Filter and prune non-system messages (system messages are SystemModelMessage by construction)
  const prunedModelMessages = pruneMessages({
    messages: nonSystemModelMessages,
    reasoning: "all",
    emptyMessages: "remove",
    toolCalls: "none",
  }).slice(-config.windowSize);

  return {
    systemMessages: systemModelMessages,
    messages: prunedModelMessages,
    originalMessages: validUIMessages,
  };
}
