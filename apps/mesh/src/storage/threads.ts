/**
 * Thread Storage Implementation
 *
 * Handles CRUD operations for chat threads and messages using Kysely (database-agnostic).
 * Threads are organization-scoped, messages are thread-scoped.
 */

import type { Kysely } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type { ThreadStoragePort } from "./ports";
import type { Database, Thread, ThreadMessage } from "./types";
import { UIMessage } from "ai";
import { Metadata } from "@deco/ui/types/chat-metadata.js";

// ============================================================================
// Thread Storage Implementation
// ============================================================================

export class SqlThreadStorage implements ThreadStoragePort {
  constructor(private db: Kysely<Database>) {}

  // ==========================================================================
  // Thread Operations
  // ==========================================================================

  async create(data: Partial<Thread>): Promise<Thread> {
    const id = data.id ?? generatePrefixedId("thrd");
    const now = new Date().toISOString();

    if (!data.organizationId) {
      throw new Error("organizationId is required");
    }
    if (!data.createdBy) {
      throw new Error("createdBy is required");
    }
    if (!data.title) {
      data.title = "New Thread";
    }

    const row = {
      id,
      organization_id: data.organizationId,
      title: data.title,
      description: data.description ?? null,
      created_at: now,
      updated_at: now,
      created_by: data.createdBy,
      updated_by: data.updatedBy ?? null,
    };

    await this.db.insertInto("threads").values(row).execute();

    const thread = await this.get(id);
    if (!thread) {
      throw new Error(`Failed to create thread with id: ${id}`);
    }

    return thread;
  }

  async get(id: string): Promise<Thread | null> {
    const row = await this.db
      .selectFrom("threads")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.threadFromDbRow(row) : null;
  }

  async update(id: string, data: Partial<Thread>): Promise<Thread> {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.updatedBy !== undefined) {
      updateData.updated_by = data.updatedBy;
    }

    await this.db
      .updateTable("threads")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    const thread = await this.get(id);
    if (!thread) {
      throw new Error("Thread not found after update");
    }

    return thread;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("threads").where("id", "=", id).execute();
  }

  async list(
    organizationId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ threads: Thread[]; total: number }> {
    let query = this.db
      .selectFrom("threads")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("updated_at", "desc");

    const countQuery = this.db
      .selectFrom("threads")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("organization_id", "=", organizationId);

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const [rows, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirst(),
    ]);

    return {
      threads: rows.map((row) => this.threadFromDbRow(row)),
      total: Number(countResult?.count || 0),
    };
  }

  async listByUserId(
    userId: string,
  ): Promise<{ threads: Thread[]; total: number }> {
    const rows = await this.db
      .selectFrom("threads")
      .selectAll()
      .where("created_by", "=", userId)
      .orderBy("updated_at", "desc")
      .execute();
    return {
      threads: rows.map((row) => this.threadFromDbRow(row)),
      total: rows.length,
    };
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  async initializeThread({
    threadId,
    organizationId,
    userId,
    systemMessage,
    userMessage,
  }: {
    threadId: string;
    organizationId: string;
    userId: string;
    systemMessage: string;
    userMessage: UIMessage<Metadata>;
  }): Promise<{ thread: Thread; messages: ThreadMessage[] }> {
    const now = new Date().toISOString();
    const { thread, messages } = await this.db
      .transaction()
      .execute(async (tx) => {
        const threadRow = await tx
          .insertInto("threads")
          .values({
            id: threadId,
            organization_id: organizationId,
            created_by: userId,
            title: "New Thread",
            description: "New Thread",
            created_at: now,
            updated_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        const messagesRows = await tx
          .insertInto("thread_messages")
          .values([
            {
              id: generatePrefixedId("msg"),
              thread_id: threadId,
              role: "system",
              parts: JSON.stringify([{ type: "text", text: systemMessage }]),
              created_at: now,
              updated_at: now,
            },
            {
              id: generatePrefixedId("msg"),
              thread_id: threadId,
              role: "user",
              parts: JSON.stringify(userMessage.parts),
              metadata: userMessage.metadata
                ? JSON.stringify(userMessage.metadata)
                : undefined,
              created_at: now,
              updated_at: now,
            },
          ])
          .returningAll()
          .execute();
        return {
          thread: this.threadFromDbRow(threadRow),
          messages: messagesRows.map((message) =>
            this.messageFromDbRow(message),
          ),
        };
      });

    return { thread, messages };
  }

  async createMessage(data: Partial<ThreadMessage>): Promise<ThreadMessage> {
    const id = data.id ?? generatePrefixedId("msg");
    const now = new Date().toISOString();

    if (!data.threadId) {
      throw new Error("threadId is required");
    }
    if (!data.role) {
      throw new Error("role is required");
    }
    if (!data.parts) {
      throw new Error("parts is required");
    }

    const row = {
      id,
      thread_id: data.threadId,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      parts: JSON.stringify(data.parts),
      role: data.role,
      created_at: now,
      updated_at: now,
    };

    await this.db.insertInto("thread_messages").values(row).execute();

    const message = await this.getMessage(id);
    if (!message) {
      throw new Error(`Failed to create thread message with id: ${id}`);
    }

    return message;
  }

  async getMessage(id: string): Promise<ThreadMessage | null> {
    const row = await this.db
      .selectFrom("thread_messages")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.messageFromDbRow(row) : null;
  }

  async updateMessage(
    id: string,
    data: Partial<ThreadMessage>,
  ): Promise<ThreadMessage> {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata
        ? JSON.stringify(data.metadata)
        : null;
    }
    if (data.parts !== undefined) {
      updateData.parts = JSON.stringify(data.parts);
    }
    if (data.role !== undefined) {
      updateData.role = data.role;
    }

    await this.db
      .updateTable("thread_messages")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    const message = await this.getMessage(id);
    if (!message) {
      throw new Error("Thread message not found after update");
    }

    return message;
  }

  async deleteMessage(id: string): Promise<void> {
    await this.db.deleteFrom("thread_messages").where("id", "=", id).execute();
  }

  async listMessages(threadId: string): Promise<ThreadMessage[]> {
    const rows = await this.db
      .selectFrom("thread_messages")
      .selectAll()
      .where("thread_id", "=", threadId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((row) => this.messageFromDbRow(row));
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private threadFromDbRow(row: {
    id: string;
    organization_id: string;
    agent_id: string | null;
    title: string;
    description: string | null;
    created_at: Date | string;
    updated_at: Date | string;
    created_by: string;
    updated_by: string | null;
  }): Thread {
    return {
      id: row.id,
      organizationId: row.organization_id,
      agentId: row.agent_id,
      title: row.title,
      description: row.description,
      createdAt:
        typeof row.created_at === "string"
          ? row.created_at
          : row.created_at.toISOString(),
      updatedAt:
        typeof row.updated_at === "string"
          ? row.updated_at
          : row.updated_at.toISOString(),
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private messageFromDbRow(row: {
    id: string;
    thread_id: string;
    metadata?: string;
    parts: string | Record<string, unknown>[];
    role: "user" | "assistant" | "system";
    created_at: Date | string;
    updated_at: Date | string;
  }): ThreadMessage {
    let metadata: Record<string, unknown> | undefined;
    let parts: ThreadMessage["parts"];

    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
    } catch (e) {
      console.error(
        `Failed to parse metadata for message ${row.id}:`,
        row.metadata,
        e,
      );
      metadata = undefined;
    }

    try {
      parts = typeof row.parts === "string" ? JSON.parse(row.parts) : row.parts;
    } catch (e) {
      console.error(
        `Failed to parse parts for message ${row.id}:`,
        row.parts,
        e,
      );
      // Return empty parts array to prevent crashes, but log for debugging
      parts = [];
    }

    return {
      id: row.id,
      threadId: row.thread_id,
      metadata,
      parts,
      role: row.role,
      createdAt:
        typeof row.created_at === "string"
          ? row.created_at
          : row.created_at.toISOString(),
      updatedAt:
        typeof row.updated_at === "string"
          ? row.updated_at
          : row.updated_at.toISOString(),
    };
  }
}
