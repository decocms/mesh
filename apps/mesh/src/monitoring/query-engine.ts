/**
 * QueryEngine abstraction for monitoring queries.
 *
 * Current implementation:
 * - DuckDBEngine: local dev, uses @duckdb/node-api
 *
 * Future (when production ClickHouse exists):
 * - ClickHouseClientEngine: production, uses @clickhouse/client over HTTP
 */

import { DEFAULT_MONITORING_DATA_PATH } from "./schema";

export interface QueryEngine {
  query(sql: string): Promise<Record<string, unknown>[]>;
  destroy?(): void | Promise<void>;
}

/**
 * DuckDB engine for local dev monitoring queries.
 * Uses an in-memory DuckDB instance that reads NDJSON files from disk.
 */
export class DuckDBEngine implements QueryEngine {
  private instancePromise: Promise<any> | null = null;
  private connPromise: Promise<any> | null = null;

  private async getConnection() {
    if (!this.instancePromise) {
      const duckdb = require("@duckdb/node-api");
      this.instancePromise = duckdb.DuckDBInstance.create(":memory:");
    }
    if (!this.connPromise) {
      this.connPromise = this.instancePromise!.then((inst: any) =>
        inst.connect(),
      );
    }
    return this.connPromise;
  }

  async query(sql: string): Promise<Record<string, unknown>[]> {
    const conn = await this.getConnection();
    const result = await conn.run(sql);
    const rows = await result.getRowObjects();
    // Convert BigInt values to Number for JSON compatibility
    return (rows as Record<string, unknown>[]).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          typeof v === "bigint" ? Number(v) : v,
        ]),
      ),
    );
  }

  async destroy(): Promise<void> {
    // DuckDB instance will be GC'd
    this.connPromise = null;
    this.instancePromise = null;
  }
}

export interface MonitoringEngineConfig {
  clickhouseUrl?: string;
  basePath?: string;
}

/**
 * Create the appropriate QueryEngine and source expression based on config.
 *
 * - If clickhouseUrl is set: throws (not yet implemented)
 * - Otherwise: DuckDBEngine querying local NDJSON files
 *
 * Returns { engine, source } where source is the FROM clause expression.
 */
export function createMonitoringEngine(config: MonitoringEngineConfig): {
  engine: QueryEngine;
  source: string;
} {
  if (config.clickhouseUrl) {
    throw new Error(
      "ClickHouseClientEngine is not yet implemented. " +
        "Add @clickhouse/client and implement ClickHouseClientEngine when production ClickHouse infrastructure exists.",
    );
  }

  const basePath = config.basePath ?? DEFAULT_MONITORING_DATA_PATH;
  return {
    engine: new DuckDBEngine(),
    source: `read_ndjson_auto('${basePath}/**/*.ndjson', union_by_name=true, ignore_errors=true)`,
  };
}
