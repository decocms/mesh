/**
 * Sandbox Runner State Storage
 *
 * Kysely-backed implementation of RunnerStateStore for the sandbox package.
 * The `state` jsonb is opaque — each runner (docker/freestyle) serialises its
 * own private fields. See packages/mesh-plugin-user-sandbox/server/runner/.
 */

import type { Kysely } from "kysely";
import type {
  RunnerStatePut,
  RunnerStateRecord,
  RunnerStateRecordWithId,
  RunnerStateStore,
  SandboxId,
} from "mesh-plugin-user-sandbox/runner";
import type { Database } from "./types";

export class KyselySandboxRunnerStateStore implements RunnerStateStore {
  constructor(private db: Kysely<Database>) {}

  async get(id: SandboxId, kind: string): Promise<RunnerStateRecord | null> {
    const row = await this.db
      .selectFrom("sandbox_runner_state")
      .select(["handle", "state", "updated_at"])
      .where("user_id", "=", id.userId)
      .where("project_ref", "=", id.projectRef)
      .where("runner_kind", "=", kind)
      .executeTakeFirst();
    if (!row) return null;
    return {
      handle: row.handle,
      state: row.state as Record<string, unknown>,
      updatedAt: row.updated_at as Date,
    };
  }

  async getByHandle(
    kind: string,
    handle: string,
  ): Promise<RunnerStateRecordWithId | null> {
    const row = await this.db
      .selectFrom("sandbox_runner_state")
      .select(["user_id", "project_ref", "handle", "state", "updated_at"])
      .where("runner_kind", "=", kind)
      .where("handle", "=", handle)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: { userId: row.user_id, projectRef: row.project_ref },
      handle: row.handle,
      state: row.state as Record<string, unknown>,
      updatedAt: row.updated_at as Date,
    };
  }

  async put(id: SandboxId, kind: string, entry: RunnerStatePut): Promise<void> {
    const stateJson = JSON.stringify(entry.state);
    const now = new Date().toISOString();
    await this.db
      .insertInto("sandbox_runner_state")
      .values({
        user_id: id.userId,
        project_ref: id.projectRef,
        runner_kind: kind,
        handle: entry.handle,
        state: stateJson,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["user_id", "project_ref", "runner_kind"]).doUpdateSet({
          handle: entry.handle,
          state: stateJson,
          updated_at: now,
        }),
      )
      .execute();
  }

  async delete(id: SandboxId, kind: string): Promise<void> {
    await this.db
      .deleteFrom("sandbox_runner_state")
      .where("user_id", "=", id.userId)
      .where("project_ref", "=", id.projectRef)
      .where("runner_kind", "=", kind)
      .execute();
  }

  async deleteByHandle(kind: string, handle: string): Promise<void> {
    await this.db
      .deleteFrom("sandbox_runner_state")
      .where("runner_kind", "=", kind)
      .where("handle", "=", handle)
      .execute();
  }
}
