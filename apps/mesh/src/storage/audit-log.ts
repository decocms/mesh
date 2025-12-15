/**
 * Audit Log Storage Implementation
 *
 * Tracks all tool executions for auditing and compliance
 */

import type { Kysely } from "kysely";
import type { Database, AuditLog } from "./types";
import { generatePrefixedId } from "@/shared/utils/generate-id";

export interface LogAuditParams {
  organizationId?: string;
  userId?: string;
  connectionId?: string;
  toolName: string;
  allowed: boolean;
  duration?: number;
  timestamp: Date;
  requestMetadata?: Record<string, unknown>;
}

export class AuditLogStorage {
  constructor(private db: Kysely<Database>) {}

  async log(params: LogAuditParams): Promise<void> {
    const id = generatePrefixedId("audit");

    await this.db
      .insertInto("audit_logs")
      .values({
        id,
        organizationId: params.organizationId ?? null,
        userId: params.userId ?? null,
        connectionId: params.connectionId ?? null,
        toolName: params.toolName,
        allowed: params.allowed ? 1 : 0, // SQLite boolean
        duration: params.duration ?? null,
        timestamp: params.timestamp.toISOString(),
        requestMetadata: params.requestMetadata
          ? JSON.stringify(params.requestMetadata)
          : null,
      })
      .execute();
  }

  async query(filters: {
    organizationId?: string;
    userId?: string;
    connectionId?: string;
    toolName?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    let query = this.db.selectFrom("audit_logs").selectAll();

    if (filters.organizationId) {
      query = query.where("organizationId", "=", filters.organizationId);
    }
    if (filters.userId) {
      query = query.where("userId", "=", filters.userId);
    }
    if (filters.connectionId) {
      query = query.where("connectionId", "=", filters.connectionId);
    }
    if (filters.toolName) {
      query = query.where("toolName", "=", filters.toolName);
    }
    if (filters.startDate) {
      query = query.where(
        "timestamp",
        ">=",
        filters.startDate.toISOString() as never,
      );
    }
    if (filters.endDate) {
      query = query.where(
        "timestamp",
        "<=",
        filters.endDate.toISOString() as never,
      );
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const logs = await query.execute();

    return logs.map((log) => ({
      ...log,
      allowed: log.allowed === 1, // Convert SQLite boolean
      requestMetadata:
        log.requestMetadata && typeof log.requestMetadata === "string"
          ? (JSON.parse(log.requestMetadata) as Record<string, unknown>)
          : log.requestMetadata,
    }));
  }
}
