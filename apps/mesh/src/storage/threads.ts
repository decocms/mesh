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
      data.title = "New Thread - " + now;
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

    const result = await this.db
      .insertInto("threads")
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.threadFromDbRow(result);
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

  async saveMessages(data: ThreadMessage[]): Promise<void> {
    const now = new Date().toISOString();
    const threadId = data[0]?.threadId;
    if (!threadId) {
      throw new Error("threadId is required when creating multiple messages");
    }
    // Preserve original createdAt if provided to maintain message ordering.
    // Messages in a batch may have been created at different times on the client.
    const rows = data.map((message) => ({
      id: message.id,
      thread_id: threadId,
      metadata: message.metadata ? JSON.stringify(message.metadata) : null,
      parts: JSON.stringify(message.parts),
      role: message.role,
      created_at: message.createdAt ?? now,
      updated_at: now,
    }));
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto("thread_messages").values(rows).execute();
      await trx
        .updateTable("threads")
        .set({
          updated_at: now,
        })
        .where("id", "=", threadId)
        .execute();
    });
  }

  async listMessages(
    threadId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ messages: ThreadMessage[]; total: number }> {
    // Order by created_at first, then by id as a tiebreaker for stable ordering
    // when messages have identical timestamps (e.g., batched inserts).
    let query = this.db
      .selectFrom("thread_messages")
      .selectAll()
      .where("thread_id", "=", threadId)
      .orderBy("created_at", "asc")
      .orderBy("id", "asc");

    const countQuery = this.db
      .selectFrom("thread_messages")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("thread_id", "=", threadId);

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
      messages: rows.map((row) => this.messageFromDbRow(row)),
      total: Number(countResult?.count || 0),
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private threadFromDbRow(row: {
    id: string;
    organization_id: string;
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
    metadata: string | null;
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
