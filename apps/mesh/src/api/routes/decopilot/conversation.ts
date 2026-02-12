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

/**
 * Split request messages into system and the single request message.
 * Schema guarantees exactly one non-system message.
 */
export function splitRequestMessages(messages: ChatMessage[]): {
  systemMessages: ChatMessage[];
  requestMessage: ChatMessage;
} {
  const systemMessages = messages.filter((m) => m.role === "system");
  const requestMessage = messages.find((m) => m.role !== "system")!;
  return { systemMessages, requestMessage };
}

export interface ProcessedConversation {
  systemMessages: SystemModelMessage[];
  messages: ReturnType<typeof pruneMessages>;
  originalMessages: ChatMessage[];
}

function splitMessages(messages: ModelMessage[]): {
  systemMessages: Extract<ModelMessage, { role: "system" }>[];
  messages: Extract<ModelMessage, { role: "user" | "assistant" | "tool" }>[];
} {
  const [system, nonSystem] = messages.reduce(
    (acc, m) => {
      if (m.role === "system") acc[0].push(m);
      else acc[1].push(m);
      return acc;
    },
    [[], []] as [
      Extract<ModelMessage, { role: "system" }>[],
      Extract<ModelMessage, { role: "user" | "assistant" | "tool" }>[],
    ],
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
  requestMessage: ChatMessage,
  systemMessages: ChatMessage[],
  config: { windowSize: number; models: ModelsConfig },
): Promise<ProcessedConversation> {
  // Load thread history
  const threadMessages = await memory.loadHistory(config.windowSize);

  // ID-based merge: if incoming message matches a thread message, replace it and drop the rest; else append
  const matchIndex = threadMessages.findIndex(
    (m) => m.id === requestMessage.id,
  );
  const conversation =
    matchIndex >= 0
      ? [...threadMessages.slice(0, matchIndex), requestMessage]
      : [...threadMessages, requestMessage];

  const allMessages: ChatMessage[] = [...systemMessages, ...conversation];

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
  });

  return {
    systemMessages: systemModelMessages,
    messages: prunedModelMessages,
    originalMessages: validUIMessages,
  };
}
