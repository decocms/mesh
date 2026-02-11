/**
 * Memory
 *
 * Thread-based conversation history management.
 * Wraps the thread storage for conversation-focused operations.
 */

import type { Thread, ThreadMessage } from "@/storage/types";
import type { ThreadStoragePort } from "@/storage/ports";
import { generatePrefixedId } from "@/shared/utils/generate-id";

/**
 * Configuration for creating a Memory instance
 */
export interface MemoryConfig {
  /** Thread ID (creates new if not found) */
  threadId?: string | null;

  /** Organization scope */
  organizationId: string;

  /** User who owns/created the thread */
  userId: string;

  /** Default window size for pruning */
  defaultWindowSize?: number;
}

/**
 * Thread-based conversation memory.
 *
 * Provides:
 * - Thread management (get or create)
 * - Message history loading
 * - Message saving
 * - Pruning for context window management
 */
export class Memory {
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

  async loadHistory(windowSize?: number): Promise<ThreadMessage[]> {
    const limit = windowSize ?? this.defaultWindowSize;
    const { messages } = await this.storage.listMessages(this.thread.id, {
      limit,
      sort: "desc",
    });
    // Reverse so chronological (oldest first)
    const chronological = [...messages].reverse();
    // Ensure the window starts with a "user" message; trim from the start if needed.
    // When no user message exists in the window, keep the windowed messages to preserve
    // assistant/tool context for follow-up turns.
    const startIndex = chronological.findIndex((m) => m.role === "user");
    return startIndex >= 0 ? chronological.slice(startIndex) : chronological;
  }

  async save(messages: ThreadMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.storage.saveMessages(messages);
  }
}

/**
 * Create or get a thread, returning a Memory instance
 */
export async function createMemory(
  storage: ThreadStoragePort,
  config: MemoryConfig,
): Promise<Memory> {
  const { threadId, organizationId, userId, defaultWindowSize } = config;

  let thread: Thread;

  if (!threadId) {
    // Create new thread
    thread = await storage.create({
      id: generatePrefixedId("thrd"),
      organizationId,
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
        createdBy: userId,
      });
    } else {
      thread = existing;
    }
  }

  return new Memory({
    thread,
    storage,
    defaultWindowSize,
  });
}
