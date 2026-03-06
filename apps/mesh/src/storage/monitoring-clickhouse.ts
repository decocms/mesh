/**
 * ClickHouseMonitoringStorage
 *
 * Implements MonitoringStorage using ClickHouse SQL via QueryEngine.
 * Local dev uses chdb (embedded ClickHouse) to query NDJSON files on disk.
 *
 * Writes (log/logBatch) are no-ops — data flows through the OTel pipeline
 * (NDJSONSpanExporter) and is read back from NDJSON files on disk.
 */

import type { QueryEngine } from "../monitoring/query-engine";
import type { MonitoringLog } from "./types";
import type {
  AggregationParams,
  AggregationResult,
  MonitoringStorage,
  PropertyFilters,
} from "./ports";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Escape a string value for safe use in SQL single-quoted literals. */
function esc(value: string): string {
  return value.replace(/\0/g, "").replace(/'/g, "''");
}

/** Allowed groupByColumn values. */
const ALLOWED_GROUP_BY_COLUMNS = new Set([
  "connection_id",
  "connection_title",
  "user_id",
  "tool_name",
  "virtual_mcp_id",
]);

/** Validate a groupByColumn identifier. */
function validateGroupByColumn(col: string): string {
  if (!ALLOWED_GROUP_BY_COLUMNS.has(col)) {
    throw new Error(`Invalid groupByColumn: ${col}`);
  }
  return col;
}

/** Strict JSONPath regex: allows $.key.subkey or key.subkey forms. */
const JSONPATH_REGEX = /^\$?\.?[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;

/** Validate and normalise a JSONPath expression. Returns the $.key.subkey form. */
function validateJsonPath(path: string): string {
  if (!JSONPATH_REGEX.test(path)) {
    throw new Error(`Invalid JSONPath: ${path}`);
  }
  // Normalise to $.key form
  if (path.startsWith("$.")) return path;
  if (path.startsWith(".")) return `$${path}`;
  return `$.${path}`;
}

/**
 * Convert a validated JSONPath ($.key or $.key.subkey) to ClickHouse
 * JSONExtract key arguments: 'key' or 'key', 'subkey'
 */
function jsonPathToChKeys(jsonPath: string): string {
  // Remove leading $. then split by .
  const keys = jsonPath.replace(/^\$\./, "").split(".");
  return keys.map((k) => `'${esc(k)}'`).join(", ");
}

/** Interval regex and max amounts. */
const INTERVAL_REGEX = /^(\d+)([mhd])$/;
const MAX_INTERVAL_AMOUNTS: Record<string, number> = {
  m: 525960,
  h: 8760,
  d: 365,
};

function parseInterval(interval: string): { amount: number; unit: string } {
  const match = INTERVAL_REGEX.exec(interval);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid interval: ${interval}`);
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const max = MAX_INTERVAL_AMOUNTS[unit]!;
  if (amount < 1 || amount > max) {
    throw new Error(
      `Invalid interval amount: ${amount}${unit} (max ${max}${unit})`,
    );
  }
  return { amount, unit };
}

function intervalToSQL(interval: string): string {
  const { amount, unit } = parseInterval(interval);
  const unitMap: Record<string, string> = {
    m: "MINUTE",
    h: "HOUR",
    d: "DAY",
  };
  const sqlUnit = unitMap[unit];
  return `toStartOfInterval(parseDateTimeBestEffort(timestamp), INTERVAL ${amount} ${sqlUnit})`;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function safeJsonParse(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return {};
  if (typeof val === "object") return val as Record<string, unknown>;
  try {
    return JSON.parse(String(val));
  } catch {
    return {};
  }
}

function toMonitoringLog(row: Record<string, unknown>): MonitoringLog {
  return {
    id: String(row.id ?? ""),
    organizationId: String(row.organization_id ?? ""),
    connectionId: String(row.connection_id ?? ""),
    connectionTitle: String(row.connection_title ?? ""),
    toolName: String(row.tool_name ?? ""),
    input: safeJsonParse(row.input),
    output: safeJsonParse(row.output),
    isError: row.is_error === 1 || row.is_error === true,
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    durationMs: Number(row.duration_ms ?? 0),
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp ?? ""),
    userId: row.user_id != null ? String(row.user_id) : null,
    requestId: String(row.request_id ?? ""),
    userAgent: row.user_agent != null ? String(row.user_agent) : null,
    virtualMcpId:
      row.virtual_mcp_id != null ? String(row.virtual_mcp_id) : null,
    properties: row.properties
      ? (safeJsonParse(row.properties) as Record<string, string>)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Property filter SQL builder (ClickHouse syntax)
// ---------------------------------------------------------------------------

function buildPropertyFilterClauses(filters: PropertyFilters): string[] {
  const clauses: string[] = [];

  if (filters.properties) {
    for (const [key, value] of Object.entries(filters.properties)) {
      const k = esc(key);
      const v = esc(value);
      clauses.push(`JSONExtractString(properties, '${k}') = '${v}'`);
    }
  }

  if (filters.propertyKeys) {
    for (const key of filters.propertyKeys) {
      const k = esc(key);
      clauses.push(
        `JSONExtractString(properties, '${k}') IS NOT NULL AND JSONExtractString(properties, '${k}') != ''`,
      );
    }
  }

  if (filters.propertyPatterns) {
    for (const [key, pattern] of Object.entries(filters.propertyPatterns)) {
      const k = esc(key);
      const p = esc(pattern);
      clauses.push(`JSONExtractString(properties, '${k}') ILIKE '${p}'`);
    }
  }

  if (filters.propertyInValues) {
    for (const [key, value] of Object.entries(filters.propertyInValues)) {
      const k = esc(key);
      const v = esc(value);
      clauses.push(
        `has(splitByChar(',', JSONExtractString(properties, '${k}')), '${v}')`,
      );
    }
  }

  return clauses;
}

// ---------------------------------------------------------------------------
// Timestamp filter helper (ClickHouse syntax)
// ---------------------------------------------------------------------------

function tsGte(date: Date): string {
  return `parseDateTimeBestEffort(timestamp) >= parseDateTimeBestEffort('${date.toISOString()}')`;
}

function tsLte(date: Date): string {
  return `parseDateTimeBestEffort(timestamp) <= parseDateTimeBestEffort('${date.toISOString()}')`;
}

// ---------------------------------------------------------------------------
// ClickHouseMonitoringStorage
// ---------------------------------------------------------------------------

export class ClickHouseMonitoringStorage implements MonitoringStorage {
  constructor(
    private engine: QueryEngine,
    private source: string,
  ) {}

  // Writes are no-ops — data flows through the OTel pipeline
  async log(_event: MonitoringLog): Promise<void> {
    console.warn(
      "ClickHouseMonitoringStorage.log() is a no-op. Writes go through OTel pipeline.",
    );
  }

  async logBatch(_events: MonitoringLog[]): Promise<void> {
    console.warn(
      "ClickHouseMonitoringStorage.logBatch() is a no-op. Writes go through OTel pipeline.",
    );
  }

  async query(filters: {
    organizationId: string;
    connectionId?: string;
    excludeConnectionIds?: string[];
    virtualMcpId?: string;
    toolName?: string;
    isError?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    propertyFilters?: PropertyFilters;
  }): Promise<{ logs: MonitoringLog[]; total: number }> {
    if (!filters.organizationId) {
      throw new Error("organizationId is required");
    }

    const where: string[] = [
      `organization_id = '${esc(filters.organizationId)}'`,
    ];

    if (filters.connectionId) {
      where.push(`connection_id = '${esc(filters.connectionId)}'`);
    }
    if (filters.excludeConnectionIds?.length) {
      const ids = filters.excludeConnectionIds
        .map((id) => `'${esc(id)}'`)
        .join(",");
      where.push(`connection_id NOT IN (${ids})`);
    }
    if (filters.virtualMcpId) {
      where.push(`virtual_mcp_id = '${esc(filters.virtualMcpId)}'`);
    }
    if (filters.toolName) {
      where.push(`tool_name = '${esc(filters.toolName)}'`);
    }
    if (filters.isError !== undefined) {
      where.push(`is_error = ${filters.isError ? 1 : 0}`);
    }
    if (filters.startDate) {
      where.push(tsGte(filters.startDate));
    }
    if (filters.endDate) {
      where.push(tsLte(filters.endDate));
    }
    if (filters.propertyFilters) {
      where.push(...buildPropertyFilterClauses(filters.propertyFilters));
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `SELECT *, count(*) OVER () AS _total FROM ${this.source} WHERE ${where.join(" AND ")} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

    const rows = await this.engine.query(sql);

    if (rows.length === 0) {
      return { logs: [], total: 0 };
    }

    const total = Number(rows[0]!._total ?? 0);
    const logs = rows.map(toMonitoringLog);

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
    if (!filters.organizationId) {
      throw new Error("organizationId is required");
    }

    const where: string[] = [
      `organization_id = '${esc(filters.organizationId)}'`,
    ];

    if (filters.startDate) {
      where.push(tsGte(filters.startDate));
    }
    if (filters.endDate) {
      where.push(tsLte(filters.endDate));
    }

    const sql = `SELECT count(*) AS total_calls, coalesce(sum(CASE WHEN is_error = 1 THEN 1.0 ELSE 0.0 END) / NULLIF(count(*), 0), 0) AS error_rate, coalesce(avg(duration_ms), 0) AS avg_duration_ms FROM ${this.source} WHERE ${where.join(" AND ")}`;

    const rows = await this.engine.query(sql);
    const row = rows[0] ?? {};

    return {
      totalCalls: Number(row.total_calls ?? 0),
      errorRate: Number(row.error_rate ?? 0),
      avgDurationMs: Number(row.avg_duration_ms ?? 0),
    };
  }

  async aggregate(params: AggregationParams): Promise<AggregationResult> {
    if (!params.organizationId) {
      throw new Error("organizationId is required");
    }

    const jsonPath = validateJsonPath(params.path);
    const sourceCol = params.from === "input" ? "input" : "output";
    const chKeys = jsonPathToChKeys(jsonPath);

    // Build the value expression using ClickHouse JSONExtract functions
    const valueExpr =
      params.aggregation === "count" || params.aggregation === "count_all"
        ? "1"
        : `JSONExtractFloat(${sourceCol}, ${chKeys})`;

    // Build aggregation expression
    const aggExpr = buildAggExpr(params.aggregation, valueExpr);

    // Build WHERE clause
    const where: string[] = [
      `organization_id = '${esc(params.organizationId)}'`,
    ];

    // For count (not count_all), only count rows where the path exists and is non-null
    if (params.aggregation === "count") {
      where.push(`JSONExtractString(${sourceCol}, ${chKeys}) IS NOT NULL`);
      where.push(`JSONExtractString(${sourceCol}, ${chKeys}) != ''`);
    }

    // Exclude count_all from null filtering — it counts all rows
    if (params.aggregation !== "count" && params.aggregation !== "count_all") {
      where.push(`JSONExtractString(${sourceCol}, ${chKeys}) IS NOT NULL`);
      where.push(`JSONExtractString(${sourceCol}, ${chKeys}) != ''`);
    }

    if (params.filters?.connectionIds?.length) {
      const ids = params.filters.connectionIds
        .map((id) => `'${esc(id)}'`)
        .join(",");
      where.push(`connection_id IN (${ids})`);
    }
    if (params.filters?.virtualMcpIds?.length) {
      const ids = params.filters.virtualMcpIds
        .map((id) => `'${esc(id)}'`)
        .join(",");
      where.push(`virtual_mcp_id IN (${ids})`);
    }
    if (params.filters?.toolNames?.length) {
      const names = params.filters.toolNames
        .map((n) => `'${esc(n)}'`)
        .join(",");
      where.push(`tool_name IN (${names})`);
    }
    if (params.filters?.startDate) {
      where.push(tsGte(params.filters.startDate));
    }
    if (params.filters?.endDate) {
      where.push(tsLte(params.filters.endDate));
    }
    if (params.filters?.propertyFilters) {
      where.push(...buildPropertyFilterClauses(params.filters.propertyFilters));
    }

    const whereClause = where.join(" AND ");

    // --- groupByColumn (takes priority) ---
    if (params.groupByColumn) {
      const col = validateGroupByColumn(params.groupByColumn);
      const sql = `SELECT ${col} AS group_key, ${aggExpr} AS value FROM ${this.source} WHERE ${whereClause} GROUP BY ${col} ORDER BY value DESC`;
      const rows = await this.engine.query(sql);
      return {
        value: null,
        groups: rows.map((r) => ({
          key: String(r.group_key ?? ""),
          value: Number(r.value ?? 0),
        })),
      };
    }

    // --- groupBy (JSONPath) ---
    if (params.groupBy) {
      const groupPath = validateJsonPath(params.groupBy);
      const groupSourceCol = params.from === "input" ? "input" : "output";
      const groupChKeys = jsonPathToChKeys(groupPath);
      const groupExpr = `JSONExtractString(${groupSourceCol}, ${groupChKeys})`;
      const sql = `SELECT ${groupExpr} AS group_key, ${aggExpr} AS value FROM ${this.source} WHERE ${whereClause} AND ${groupExpr} IS NOT NULL GROUP BY ${groupExpr} ORDER BY value DESC`;
      const rows = await this.engine.query(sql);
      return {
        value: null,
        groups: rows.map((r) => ({
          key: String(r.group_key ?? ""),
          value: Number(r.value ?? 0),
        })),
      };
    }

    // --- interval (timeseries) ---
    if (params.interval) {
      const bucketExpr = intervalToSQL(params.interval);
      const sql = `SELECT ${bucketExpr} AS bucket, ${aggExpr} AS value FROM ${this.source} WHERE ${whereClause} GROUP BY bucket ORDER BY bucket ASC`;
      const rows = await this.engine.query(sql);
      return {
        value: null,
        timeseries: rows.map((r) => ({
          timestamp: String(r.bucket ?? ""),
          value: Number(r.value ?? 0),
        })),
      };
    }

    // --- simple aggregation ---
    const sql = `SELECT ${aggExpr} AS value FROM ${this.source} WHERE ${whereClause}`;
    const rows = await this.engine.query(sql);
    return {
      value: Number(rows[0]?.value ?? 0),
    };
  }

  async countMatched(params: {
    organizationId: string;
    path: string;
    from: "input" | "output";
    filters?: {
      connectionIds?: string[];
      toolNames?: string[];
      virtualMcpIds?: string[];
      startDate?: Date;
      endDate?: Date;
      propertyFilters?: PropertyFilters;
    };
  }): Promise<number> {
    if (!params.organizationId) {
      throw new Error("organizationId is required");
    }

    const jsonPath = validateJsonPath(params.path);
    const sourceCol = params.from === "input" ? "input" : "output";
    const chKeys = jsonPathToChKeys(jsonPath);

    const where: string[] = [
      `organization_id = '${esc(params.organizationId)}'`,
      `JSONExtractString(${sourceCol}, ${chKeys}) IS NOT NULL`,
      `JSONExtractString(${sourceCol}, ${chKeys}) != ''`,
    ];

    if (params.filters?.connectionIds?.length) {
      const ids = params.filters.connectionIds
        .map((id) => `'${esc(id)}'`)
        .join(",");
      where.push(`connection_id IN (${ids})`);
    }
    if (params.filters?.toolNames?.length) {
      const names = params.filters.toolNames
        .map((n) => `'${esc(n)}'`)
        .join(",");
      where.push(`tool_name IN (${names})`);
    }
    if (params.filters?.virtualMcpIds?.length) {
      const ids = params.filters.virtualMcpIds
        .map((id) => `'${esc(id)}'`)
        .join(",");
      where.push(`virtual_mcp_id IN (${ids})`);
    }
    if (params.filters?.startDate) {
      where.push(tsGte(params.filters.startDate));
    }
    if (params.filters?.endDate) {
      where.push(tsLte(params.filters.endDate));
    }
    if (params.filters?.propertyFilters) {
      where.push(...buildPropertyFilterClauses(params.filters.propertyFilters));
    }

    const sql = `SELECT count(*) AS cnt FROM ${this.source} WHERE ${where.join(" AND ")}`;
    const rows = await this.engine.query(sql);
    return Number(rows[0]?.cnt ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Aggregation expression builder
// ---------------------------------------------------------------------------

function buildAggExpr(fn: string, valueExpr: string): string {
  switch (fn) {
    case "sum":
      return `coalesce(sum(${valueExpr}), 0)`;
    case "avg":
      return `coalesce(avg(${valueExpr}), 0)`;
    case "min":
      return `min(${valueExpr})`;
    case "max":
      return `max(${valueExpr})`;
    case "count":
      return `count(*)`;
    case "count_all":
      return `count(*)`;
    case "last":
      return `max(${valueExpr})`; // simplified: last = max
    default:
      throw new Error(`Unknown aggregation function: ${fn}`);
  }
}
