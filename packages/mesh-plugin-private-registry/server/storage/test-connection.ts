import { randomUUID } from "node:crypto";
import type { Insertable, Kysely, Selectable, Updateable } from "kysely";
import type {
  PrivateRegistryDatabase,
  TestConnectionAuthStatus,
  TestConnectionEntity,
} from "./types";

type RawRow = Selectable<
  PrivateRegistryDatabase["private_registry_test_connection"]
>;

export class TestConnectionStorage {
  constructor(private db: Kysely<PrivateRegistryDatabase>) {}

  async findByItemId(
    organizationId: string,
    itemId: string,
  ): Promise<TestConnectionEntity | null> {
    const row = await this.db
      .selectFrom("private_registry_test_connection")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("item_id", "=", itemId)
      .executeTakeFirst();
    return row ? this.deserialize(row as RawRow) : null;
  }

  async list(organizationId: string): Promise<TestConnectionEntity[]> {
    const rows = await this.db
      .selectFrom("private_registry_test_connection")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("updated_at", "desc")
      .execute();
    return rows.map((row) => this.deserialize(row as RawRow));
  }

  async upsert(input: {
    organization_id: string;
    item_id: string;
    connection_id: string;
    auth_status?: TestConnectionAuthStatus;
  }): Promise<TestConnectionEntity> {
    const existing = await this.findByItemId(
      input.organization_id,
      input.item_id,
    );
    const now = new Date().toISOString();

    if (!existing) {
      const row: Insertable<
        PrivateRegistryDatabase["private_registry_test_connection"]
      > = {
        id: randomUUID(),
        organization_id: input.organization_id,
        item_id: input.item_id,
        connection_id: input.connection_id,
        auth_status: input.auth_status ?? "none",
        created_at: now,
        updated_at: now,
      };
      await this.db
        .insertInto("private_registry_test_connection")
        .values(row)
        .execute();
    } else {
      const update: Updateable<
        PrivateRegistryDatabase["private_registry_test_connection"]
      > = {
        connection_id: input.connection_id,
        auth_status: input.auth_status ?? existing.auth_status,
        updated_at: now,
      };
      await this.db
        .updateTable("private_registry_test_connection")
        .set(update)
        .where("organization_id", "=", input.organization_id)
        .where("item_id", "=", input.item_id)
        .execute();
    }

    const saved = await this.findByItemId(input.organization_id, input.item_id);
    if (!saved) {
      throw new Error("Failed to save test connection");
    }
    return saved;
  }

  async updateAuthStatus(
    organizationId: string,
    itemId: string,
    authStatus: TestConnectionAuthStatus,
  ): Promise<TestConnectionEntity | null> {
    await this.db
      .updateTable("private_registry_test_connection")
      .set({
        auth_status: authStatus,
        updated_at: new Date().toISOString(),
      })
      .where("organization_id", "=", organizationId)
      .where("item_id", "=", itemId)
      .execute();
    return this.findByItemId(organizationId, itemId);
  }

  private deserialize(row: RawRow): TestConnectionEntity {
    return {
      id: row.id,
      organization_id: row.organization_id,
      item_id: row.item_id,
      connection_id: row.connection_id,
      auth_status: row.auth_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
