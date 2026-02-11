import { randomUUID } from "node:crypto";
import type { Insertable, Kysely, Selectable, Updateable } from "kysely";
import type {
  PrivateRegistryDatabase,
  TestResultEntity,
  TestResultStatus,
  TestRunConfigSnapshot,
  TestRunEntity,
  TestRunStatus,
  TestToolResult,
} from "./types";

type RawRunRow = Selectable<
  PrivateRegistryDatabase["private_registry_test_run"]
>;
type RawResultRow = Selectable<
  PrivateRegistryDatabase["private_registry_test_result"]
>;

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class TestRunStorage {
  constructor(private db: Kysely<PrivateRegistryDatabase>) {}

  async create(input: {
    organization_id: string;
    status?: TestRunStatus;
    config_snapshot?: TestRunConfigSnapshot | null;
    total_items?: number;
    started_at?: string | null;
  }): Promise<TestRunEntity> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const row: Insertable<
      PrivateRegistryDatabase["private_registry_test_run"]
    > = {
      id,
      organization_id: input.organization_id,
      status: input.status ?? "pending",
      config_snapshot: input.config_snapshot
        ? JSON.stringify(input.config_snapshot)
        : null,
      total_items: input.total_items ?? 0,
      tested_items: 0,
      passed_items: 0,
      failed_items: 0,
      skipped_items: 0,
      current_item_id: null,
      started_at: input.started_at ?? null,
      finished_at: null,
      created_at: now,
    };

    await this.db.insertInto("private_registry_test_run").values(row).execute();
    const created = await this.findById(input.organization_id, id);
    if (!created) {
      throw new Error(`Failed to create test run ${id}`);
    }
    return created;
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<TestRunEntity | null> {
    const row = await this.db
      .selectFrom("private_registry_test_run")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.deserializeRun(row as RawRunRow) : null;
  }

  async list(
    organizationId: string,
    query: {
      limit?: number;
      offset?: number;
      status?: TestRunStatus;
    } = {},
  ): Promise<{ items: TestRunEntity[]; totalCount: number }> {
    let base = this.db
      .selectFrom("private_registry_test_run")
      .selectAll()
      .where("organization_id", "=", organizationId);

    if (query.status) {
      base = base.where("status", "=", query.status);
    }

    const totalCountRow = await base
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirst();
    const totalCount = Number(totalCountRow?.count ?? 0);

    const rows = await base
      .orderBy("created_at", "desc")
      .limit(query.limit ?? 24)
      .offset(query.offset ?? 0)
      .execute();

    return {
      items: rows.map((row) => this.deserializeRun(row as RawRunRow)),
      totalCount,
    };
  }

  async update(
    organizationId: string,
    id: string,
    patch: {
      total_items?: number;
      status?: TestRunStatus;
      tested_items?: number;
      passed_items?: number;
      failed_items?: number;
      skipped_items?: number;
      current_item_id?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
    },
  ): Promise<TestRunEntity> {
    const update: Updateable<
      PrivateRegistryDatabase["private_registry_test_run"]
    > = {};

    if (patch.total_items !== undefined) update.total_items = patch.total_items;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.tested_items !== undefined)
      update.tested_items = patch.tested_items;
    if (patch.passed_items !== undefined)
      update.passed_items = patch.passed_items;
    if (patch.failed_items !== undefined)
      update.failed_items = patch.failed_items;
    if (patch.skipped_items !== undefined)
      update.skipped_items = patch.skipped_items;
    if (patch.current_item_id !== undefined)
      update.current_item_id = patch.current_item_id;
    if (patch.started_at !== undefined) update.started_at = patch.started_at;
    if (patch.finished_at !== undefined) update.finished_at = patch.finished_at;

    await this.db
      .updateTable("private_registry_test_run")
      .set(update)
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .execute();

    const updated = await this.findById(organizationId, id);
    if (!updated) {
      throw new Error(`Test run not found: ${id}`);
    }
    return updated;
  }

  private deserializeRun(row: RawRunRow): TestRunEntity {
    return {
      id: row.id,
      organization_id: row.organization_id,
      status: row.status,
      config_snapshot: safeJsonParse<TestRunConfigSnapshot | null>(
        row.config_snapshot,
        null,
      ),
      total_items: Number(row.total_items ?? 0),
      tested_items: Number(row.tested_items ?? 0),
      passed_items: Number(row.passed_items ?? 0),
      failed_items: Number(row.failed_items ?? 0),
      skipped_items: Number(row.skipped_items ?? 0),
      current_item_id: row.current_item_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      created_at: row.created_at,
    };
  }
}

export class TestResultStorage {
  constructor(private db: Kysely<PrivateRegistryDatabase>) {}

  async create(input: {
    run_id: string;
    organization_id: string;
    item_id: string;
    item_title: string;
    status: TestResultStatus;
    error_message?: string | null;
    connection_ok?: boolean;
    tools_listed?: boolean;
    tool_results?: TestToolResult[];
    agent_summary?: string | null;
    duration_ms?: number;
    action_taken?: string;
  }): Promise<TestResultEntity> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row: Insertable<
      PrivateRegistryDatabase["private_registry_test_result"]
    > = {
      id,
      run_id: input.run_id,
      organization_id: input.organization_id,
      item_id: input.item_id,
      item_title: input.item_title,
      status: input.status,
      error_message: input.error_message ?? null,
      connection_ok: input.connection_ok ? 1 : 0,
      tools_listed: input.tools_listed ? 1 : 0,
      tool_results: input.tool_results
        ? JSON.stringify(input.tool_results)
        : null,
      agent_summary: input.agent_summary ?? null,
      duration_ms: input.duration_ms ?? 0,
      action_taken: input.action_taken ?? "none",
      tested_at: now,
    };

    await this.db
      .insertInto("private_registry_test_result")
      .values(row)
      .execute();
    const created = await this.findById(input.organization_id, id);
    if (!created) {
      throw new Error("Failed to create test result");
    }
    return created;
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<TestResultEntity | null> {
    const row = await this.db
      .selectFrom("private_registry_test_result")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.deserialize(row as RawResultRow) : null;
  }

  async listByRun(
    organizationId: string,
    runId: string,
    query: {
      status?: TestResultStatus;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: TestResultEntity[]; totalCount: number }> {
    let base = this.db
      .selectFrom("private_registry_test_result")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("run_id", "=", runId);

    if (query.status) {
      base = base.where("status", "=", query.status);
    }

    const totalCountRow = await base
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirst();
    const totalCount = Number(totalCountRow?.count ?? 0);

    const rows = await base
      .orderBy("tested_at", "desc")
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0)
      .execute();

    return {
      items: rows.map((row) => this.deserialize(row as RawResultRow)),
      totalCount,
    };
  }

  private deserialize(row: RawResultRow): TestResultEntity {
    return {
      id: row.id,
      run_id: row.run_id,
      organization_id: row.organization_id,
      item_id: row.item_id,
      item_title: row.item_title,
      status: row.status,
      error_message: row.error_message,
      connection_ok: row.connection_ok === 1,
      tools_listed: row.tools_listed === 1,
      tool_results: safeJsonParse<TestToolResult[]>(row.tool_results, []),
      agent_summary: row.agent_summary,
      duration_ms: Number(row.duration_ms ?? 0),
      action_taken: row.action_taken,
      tested_at: row.tested_at,
    };
  }
}
