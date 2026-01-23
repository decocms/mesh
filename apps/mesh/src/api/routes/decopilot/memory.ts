/**
 * Memory Implementation
 *
 * Thread-based conversation history management.
 * Wraps the thread storage for conversation-focused operations.
 */

import type { Thread, ThreadMessage } from "@/storage/types";
import type { ThreadStoragePort } from "@/storage/ports";
import type { Memory, MemoryConfig } from "./types";
import { generatePrefixedId } from "@/shared/utils/generate-id";

/**
 * Thread-based Memory implementation
 */
class ThreadMemory implements Memory {
  readonly thread: Thread;
  readonly organizationId: string;

  private storage: ThreadStoragePort;
  private defaultWindowSize: number;

  constructor(config: {
    thread: Thread;
    storage: ThreadStoragePort;
    defaultWindowSize?: number;
  }) {
    this.thread = config.thread;
    this.organizationId = config.thread.organizationId;
    this.storage = config.storage;
    this.defaultWindowSize = config.defaultWindowSize ?? 50;
  }

  async loadHistory(): Promise<ThreadMessage[]> {
    const { messages } = await this.storage.listMessages(this.thread.id);
    return messages;
  }

  async save(messages: ThreadMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.storage.saveMessages(messages);
  }

  async getPrunedHistory(windowSize?: number): Promise<ThreadMessage[]> {
    const messages = await this.loadHistory();
    const size = windowSize ?? this.defaultWindowSize;
    return messages.slice(-size);
  }
}

/**
 * Create or get a thread, returning a Memory instance
 */
export async function createMemory(
  storage: ThreadStoragePort,
  config: MemoryConfig,
): Promise<Memory> {
  const { threadId, organizationId, userId, defaultWindowSize, virtualMcpId } =
    config;

  let thread: Thread;

  if (!threadId) {
    // Create new thread
    thread = await storage.create({
      id: generatePrefixedId("thrd"),
      organizationId,
      virtualMcpId: virtualMcpId ?? undefined,
      createdBy: userId,
    });
  } else {
    // Try to get existing thread
    const existing = await storage.get(threadId);

    if (!existing || existing.organizationId !== organizationId) {
      // Thread not found or belongs to different org - create new
      // Use fresh ID if thread exists in different org (avoid conflicts)
      thread = await storage.create({
        id: existing ? generatePrefixedId("thrd") : threadId,
        organizationId,
        virtualMcpId: virtualMcpId ?? undefined,
        createdBy: userId,
      });
    } else {
      // If existing thread doesn't have virtualMcpId and we're providing one, update it
      thread = existing;
      if (virtualMcpId && !thread.virtualMcpId) {
        thread = await storage.update(thread.id, { virtualMcpId });
      }
    }
  }

  return new ThreadMemory({
    thread,
    storage,
    defaultWindowSize,
  });
}
