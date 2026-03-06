/**
 * QueryEngine abstraction for monitoring queries.
 *
 * Current implementation:
 * - ChdbEngine: local dev, uses chdb (embedded ClickHouse)
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
 * chdb engine for local dev monitoring queries.
 * Uses embedded ClickHouse to query NDJSON files from disk.
 */
export class ChdbEngine implements QueryEngine {
  async query(sql: string): Promise<Record<string, unknown>[]> {
    const chdb = require("chdb");
    const result: string = chdb.query(sql, "JSONEachRow");
    if (!result || !result.trim()) return [];

    return result
      .trim()
      .split("\n")
      .map((line: string) => JSON.parse(line));
  }

  async destroy(): Promise<void> {
    // chdb is stateless per query — nothing to clean up
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
 * - Otherwise: ChdbEngine querying local NDJSON files
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
    engine: new ChdbEngine(),
    source: `file('${basePath}/**/*.ndjson', 'JSONEachRow')`,
  };
}
