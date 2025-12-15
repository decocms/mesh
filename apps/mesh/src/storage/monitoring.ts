/**
 * Monitoring Storage Implementation
 *
 * Handles CRUD operations for monitoring logs using Kysely (database-agnostic).
 * All logs are organization-scoped.
 */

import type { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { RegexRedactor } from "../monitoring/redactor";
import type { MonitoringStorage } from "./ports";
import type { Database, MonitoringLog } from "./types";
import { generatePrefixedId } from "@/shared/utils/generate-id";

// ============================================================================
// Monitoring Storage Implementation
// ============================================================================

export class SqlMonitoringStorage implements MonitoringStorage {
  private redactor: RegexRedactor;

  constructor(private db: Kysely<Database>) {
    this.redactor = new RegexRedactor();
  }

  async log(event: MonitoringLog): Promise<void> {
    await this.logBatch([event]);
  }

  async logBatch(events: MonitoringLog[]): Promise<void> {
    if (events.length === 0) return;

    // Apply PII redaction to each event before storing
    const redactedEvents = events.map((event) => ({
      ...event,
      input: this.redactor.redact(event.input) as Record<string, unknown>,
      output: this.redactor.redact(event.output) as Record<string, unknown>,
    }));

    // Use transaction for atomic batch insert
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("monitoring_logs")
        .values(redactedEvents.map((e) => this.toDbRow(e)))
        .execute();
    });
  }

  async query(filters: {
    organizationId?: string;
    connectionId?: string;
    toolName?: string;
    isError?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: MonitoringLog[]; total: number }> {
    let query = this.db.selectFrom("monitoring_logs").selectAll();
    let countQuery = this.db
      .selectFrom("monitoring_logs")
      .select((eb) => eb.fn.count("id").as("count"));

    // Apply filters to both queries
    if (filters.organizationId) {
      query = query.where("organization_id", "=", filters.organizationId);
      countQuery = countQuery.where(
        "organization_id",
        "=",
        filters.organizationId,
      );
    }
    if (filters.connectionId) {
      query = query.where("connection_id", "=", filters.connectionId);
      countQuery = countQuery.where("connection_id", "=", filters.connectionId);
    }
    if (filters.toolName) {
      query = query.where("tool_name", "=", filters.toolName);
      countQuery = countQuery.where("tool_name", "=", filters.toolName);
    }
    if (filters.isError !== undefined) {
      query = query.where("is_error", "=", filters.isError ? 1 : 0);
      countQuery = countQuery.where("is_error", "=", filters.isError ? 1 : 0);
    }
    if (filters.startDate) {
      query = query.where(
        "timestamp",
        ">=",
        filters.startDate.toISOString() as never,
      );
      countQuery = countQuery.where(
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
      countQuery = countQuery.where(
        "timestamp",
        "<=",
        filters.endDate.toISOString() as never,
      );
    }

    // Order by timestamp descending (most recent first)
    query = query.orderBy("timestamp", "desc");

    // Pagination (only applies to data query, not count)
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    // Execute both queries in parallel
    const [rows, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirst(),
    ]);

    const total = Number(countResult?.count || 0);
    const logs = rows.map((row) => this.fromDbRow(row));

    return { logs, total };
  }

  async getStats(filters: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalCalls: number;
    errorRate: number;
    avgDurationMs: number;
  }> {
    let query = this.db
      .selectFrom("monitoring_logs")
      .where("organization_id", "=", filters.organizationId);

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

    // Get total count, error count, and average duration using SQL aggregations
    const stats = await query
      .select([
        (eb) => eb.fn.count("id").as("total_count"),
        (eb) => eb.fn.sum(eb.ref("is_error")).as("error_count"),
        (eb) => eb.fn.avg("duration_ms").as("avg_duration"),
      ])
      .executeTakeFirst();

    const totalCalls = Number(stats?.total_count || 0);
    const errorCount = Number(stats?.error_count || 0);
    const avgDurationMs = Number(stats?.avg_duration || 0);

    return {
      totalCalls,
      errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
      avgDurationMs,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private toDbRow(log: MonitoringLog) {
    const id = log.id || generatePrefixedId("log");

    return {
      id,
      organization_id: log.organizationId,
      connection_id: log.connectionId,
      connection_title: log.connectionTitle,
      tool_name: log.toolName,
      input: JSON.stringify(log.input),
      output: JSON.stringify(log.output),
      is_error: log.isError ? 1 : 0,
      error_message: log.errorMessage || null,
      duration_ms: log.durationMs,
      timestamp:
        log.timestamp instanceof Date
          ? log.timestamp.toISOString()
          : log.timestamp,
      user_id: log.userId || null,
      request_id: log.requestId,
    };
  }

  private fromDbRow(row: {
    id: string;
    organization_id: string;
    connection_id: string;
    connection_title: string;
    tool_name: string;
    input: string | Record<string, unknown>;
    output: string | Record<string, unknown>;
    is_error: number;
    error_message: string | null;
    duration_ms: number;
    timestamp: string | Date;
    user_id: string | null;
    request_id: string;
  }): MonitoringLog {
    const input =
      typeof row.input === "string" ? JSON.parse(row.input) : row.input;
    const output =
      typeof row.output === "string" ? JSON.parse(row.output) : row.output;
    const timestamp =
      typeof row.timestamp === "string"
        ? new Date(row.timestamp)
        : row.timestamp;

    return {
      id: row.id,
      organizationId: row.organization_id,
      connectionId: row.connection_id,
      connectionTitle: row.connection_title,
      toolName: row.tool_name,
      input,
      output,
      isError: row.is_error === 1,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
      timestamp,
      userId: row.user_id,
      requestId: row.request_id,
    };
  }
}
