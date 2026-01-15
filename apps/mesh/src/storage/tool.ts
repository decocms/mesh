/**
 * Tool Storage Implementation
 *
 * Handles CRUD operations for stored tools using Kysely.
 * All tools are organization-scoped.
 */

import type { Insertable, Kysely, Updateable } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  ToolEntity,
  ToolCreateData,
  ToolUpdateData,
} from "../tools/tool/schema";
import type { ToolStoragePort } from "./ports";
import type { Database } from "./types";

/** JSON fields that need serialization/deserialization */
const JSON_FIELDS = ["input_schema", "output_schema", "dependencies"] as const;

type RawToolRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  name: string;
  input_schema: string | Record<string, unknown>;
  output_schema: string | Record<string, unknown> | null;
  execute: string;
  dependencies: string | string[];
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
  updated_by: string | null;
};

export class ToolStorage implements ToolStoragePort {
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: ToolCreateData,
  ): Promise<ToolEntity> {
    const id = generatePrefixedId("tool");
    const now = new Date().toISOString();

    const serialized = this.serializeTool({
      ...data,
      id,
      organization_id: organizationId,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: null,
    });

    await this.db
      .insertInto("tools")
      .values(serialized as Insertable<Database["tools"]>)
      .execute();

    const tool = await this.findById(id, organizationId);
    if (!tool) {
      throw new Error(`Failed to create tool with id: ${id}`);
    }
    return tool;
  }

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<ToolEntity | null> {
    let query = this.db.selectFrom("tools").selectAll().where("id", "=", id);
    if (organizationId) {
      query = query.where("organization_id", "=", organizationId);
    }
    const row = await query.executeTakeFirst();
    return row ? this.deserializeTool(row as RawToolRow) : null;
  }

  async list(organizationId: string): Promise<ToolEntity[]> {
    const rows = await this.db
      .selectFrom("tools")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
    return rows.map((row) => this.deserializeTool(row as RawToolRow));
  }

  async update(
    id: string,
    userId: string,
    data: ToolUpdateData,
  ): Promise<ToolEntity> {
    if (Object.keys(data).length === 0) {
      const tool = await this.findById(id);
      if (!tool) throw new Error("Tool not found");
      return tool;
    }

    const serialized = this.serializeTool({
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });

    await this.db
      .updateTable("tools")
      .set(serialized as Updateable<Database["tools"]>)
      .where("id", "=", id)
      .execute();

    const tool = await this.findById(id);
    if (!tool) {
      throw new Error("Tool not found after update");
    }
    return tool;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("tools").where("id", "=", id).execute();
  }

  private serializeTool(data: Partial<ToolEntity>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...data };
    for (const key of JSON_FIELDS) {
      const value = result[key];
      if (value !== undefined) {
        result[key] = JSON.stringify(value);
      }
    }
    return result;
  }

  private deserializeTool(row: RawToolRow): ToolEntity {
    const parsed: Record<string, unknown> = { ...row };
    for (const key of JSON_FIELDS) {
      const value = parsed[key];
      if (typeof value === "string") {
        try {
          parsed[key] = JSON.parse(value);
        } catch {
          parsed[key] = key === "dependencies" ? [] : {};
        }
      }
    }
    return parsed as ToolEntity;
  }
}
