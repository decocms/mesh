/**
 * Monitoring Storage Implementation
 *
 * Handles CRUD operations for monitoring logs using Kysely (database-agnostic).
 * All logs are organization-scoped.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { RegexRedactor } from "../monitoring/redactor";
import type { MonitoringStorage, PropertyFilters } from "./ports";
import type { Database, MonitoringLog } from "./types";
import { generatePrefixedId } from "@/shared/utils/generate-id";

// ============================================================================
// Monitoring Storage Implementation
// ============================================================================

export class SqlMonitoringStorage implements MonitoringStorage {
  private redactor: RegexRedactor;
  private databaseType: "sqlite" | "postgres";

  constructor(
    private db: Kysely<Database>,
    databaseType: "sqlite" | "postgres" = "sqlite",
  ) {
    this.redactor = new RegexRedactor();
    this.databaseType = databaseType;
  }

  /**
   * Get JSON property value extraction SQL fragment.
   * SQLite uses json_extract(col, '$.key'), PostgreSQL uses (col::jsonb)->>'key'.
   * Note: properties column is stored as text, so PostgreSQL needs a cast to jsonb.
   */
  private jsonExtract(column: string, key: string) {
    if (this.databaseType === "postgres") {
      // PostgreSQL: cast text to jsonb, then use ->> operator for text extraction
      return sql`(${sql.ref(column)}::jsonb)->>${key}`;
    }
    // SQLite: use json_extract with JSON path
    const jsonPath = `$.${key}`;
    return sql`json_extract(${sql.ref(column)}, ${jsonPath})`;
  }

  /**
   * Get JSON property value wrapped in commas for "in" matching.
   * This enables searching for exact values within comma-separated strings.
   * e.g., ',Engineering,Sales,' LIKE '%,Engineering,%' matches
   * but ',Engineering,Sales,' LIKE '%,Eng,%' does NOT match
   */
  private jsonExtractWithCommas(column: string, key: string) {
    if (this.databaseType === "postgres") {
      // PostgreSQL: wrap extracted value in commas
      return sql`(',' || (${sql.ref(column)}::jsonb)->>${key} || ',')`;
    }
    // SQLite: wrap extracted value in commas
    const jsonPath = `$.${key}`;
    return sql`(',' || json_extract(${sql.ref(column)}, ${jsonPath}) || ',')`;
  }

  /**
   * Escape SQL LIKE wildcards in a string value.
   * This ensures that '%' and '_' are treated as literal characters,
   * not as pattern matching wildcards.
   */
  private escapeLikeWildcards(value: string): string {
    // Escape the escape character first, then the wildcards
    return value
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
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
    virtualMcpId?: string;
    toolName?: string;
    isError?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    propertyFilters?: PropertyFilters;
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
    if (filters.virtualMcpId) {
      query = query.where("virtual_mcp_id", "=", filters.virtualMcpId);
      countQuery = countQuery.where(
        "virtual_mcp_id",
        "=",
        filters.virtualMcpId,
      );
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

    // Apply property filters
    if (filters.propertyFilters) {
      const { properties, propertyKeys, propertyPatterns, propertyInValues } =
        filters.propertyFilters;

      // Exact match: property key=value
      if (properties) {
        for (const [key, value] of Object.entries(properties)) {
          const jsonExpr = this.jsonExtract("properties", key);
          query = query.where(jsonExpr as never, "=", value as never);
          countQuery = countQuery.where(jsonExpr as never, "=", value as never);
        }
      }

      // Exists: check if property key exists
      if (propertyKeys && propertyKeys.length > 0) {
        for (const key of propertyKeys) {
          const jsonExpr = this.jsonExtract("properties", key);
          query = query.where(jsonExpr as never, "is not", null as never);
          countQuery = countQuery.where(
            jsonExpr as never,
            "is not",
            null as never,
          );
        }
      }

      // Pattern match: property value matches pattern (using LIKE)
      if (propertyPatterns) {
        for (const [key, pattern] of Object.entries(propertyPatterns)) {
          const jsonExpr = this.jsonExtract("properties", key);
          // Use ILIKE for PostgreSQL (case-insensitive), LIKE for SQLite
          const likeOp = this.databaseType === "postgres" ? "ilike" : "like";
          query = query.where(jsonExpr as never, likeOp, pattern as never);
          countQuery = countQuery.where(
            jsonExpr as never,
            likeOp,
            pattern as never,
          );
        }
      }

      // In match: check if value exists in comma-separated property value
      // This enables exact matching within arrays stored as comma-separated strings
      // e.g., user_tags="Engineering,Sales" with value="Engineering" will match
      if (propertyInValues) {
        for (const [key, value] of Object.entries(propertyInValues)) {
          // Wrap the property value in commas and search for the exact value surrounded by commas
          // This prevents partial matches (e.g., "Eng" matching "Engineering")
          // Escape LIKE wildcards to ensure exact matching (e.g., "100%" matches literally)
          const inExpr = this.jsonExtractWithCommas("properties", key);
          const escapedValue = this.escapeLikeWildcards(value);
          const searchPattern = `%,${escapedValue},%`;
          const likeCondition = sql`${inExpr} LIKE ${searchPattern} ESCAPE '\\'`;
          query = query.where(likeCondition as never);
          countQuery = countQuery.where(likeCondition as never);
        }
      }
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
      user_agent: log.userAgent || null,
      virtual_mcp_id: log.virtualMcpId || null,
      properties: log.properties ? JSON.stringify(log.properties) : null,
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
    user_agent: string | null;
    virtual_mcp_id: string | null;
    properties: string | Record<string, string> | null;
  }): MonitoringLog {
    const input =
      typeof row.input === "string" ? JSON.parse(row.input) : row.input;
    const output =
      typeof row.output === "string" ? JSON.parse(row.output) : row.output;
    const timestamp =
      typeof row.timestamp === "string"
        ? new Date(row.timestamp)
        : row.timestamp;
    const properties = row.properties
      ? typeof row.properties === "string"
        ? JSON.parse(row.properties)
        : row.properties
      : null;

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
      userAgent: row.user_agent,
      virtualMcpId: row.virtual_mcp_id,
      properties,
    };
  }
}
