/**
 * Prompt Storage Implementation
 *
 * Handles CRUD operations for stored prompts using Kysely.
 * All prompts are organization-scoped.
 */

import type { Insertable, Kysely, Updateable } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  PromptCreateData,
  PromptEntity,
  PromptUpdateData,
} from "../tools/prompt/schema";
import type { PromptStoragePort } from "./ports";
import type { Database } from "./types";

const JSON_FIELDS = ["arguments", "icons", "messages"] as const;

type RawPromptRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  name: string;
  template: string | null;
  arguments: string | unknown[] | null;
  icons: string | unknown[] | null;
  messages: string | unknown[] | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
  updated_by: string | null;
};

export class PromptStorage implements PromptStoragePort {
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: PromptCreateData,
  ): Promise<PromptEntity> {
    const id = generatePrefixedId("prm");
    const now = new Date().toISOString();

    const serialized = this.serializePrompt({
      ...data,
      id,
      organization_id: organizationId,
      created_at: now,
      updated_at: now,
      created_by: userId,
      updated_by: null,
    });

    await this.db
      .insertInto("prompts")
      .values(serialized as Insertable<Database["prompts"]>)
      .execute();

    const prompt = await this.findById(id, organizationId);
    if (!prompt) {
      throw new Error(`Failed to create prompt with id: ${id}`);
    }
    return prompt;
  }

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<PromptEntity | null> {
    let query = this.db.selectFrom("prompts").selectAll().where("id", "=", id);
    if (organizationId) {
      query = query.where("organization_id", "=", organizationId);
    }
    const row = await query.executeTakeFirst();
    return row ? this.deserializePrompt(row as RawPromptRow) : null;
  }

  async list(organizationId: string): Promise<PromptEntity[]> {
    const rows = await this.db
      .selectFrom("prompts")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
    return rows.map((row) => this.deserializePrompt(row as RawPromptRow));
  }

  async update(
    id: string,
    userId: string,
    data: PromptUpdateData,
  ): Promise<PromptEntity> {
    if (Object.keys(data).length === 0) {
      const prompt = await this.findById(id);
      if (!prompt) throw new Error("Prompt not found");
      return prompt;
    }

    const serialized = this.serializePrompt({
      ...data,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });

    await this.db
      .updateTable("prompts")
      .set(serialized as Updateable<Database["prompts"]>)
      .where("id", "=", id)
      .execute();

    const prompt = await this.findById(id);
    if (!prompt) {
      throw new Error("Prompt not found after update");
    }
    return prompt;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("prompts").where("id", "=", id).execute();
  }

  private serializePrompt(
    data: Partial<PromptEntity>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...data };
    for (const key of JSON_FIELDS) {
      const value = result[key];
      if (value !== undefined) {
        result[key] = JSON.stringify(value);
      }
    }
    return result;
  }

  private deserializePrompt(row: RawPromptRow): PromptEntity {
    const parsed: Record<string, unknown> = { ...row };
    for (const key of JSON_FIELDS) {
      const value = parsed[key];
      if (typeof value === "string") {
        try {
          parsed[key] = JSON.parse(value);
        } catch {
          parsed[key] = [];
        }
      }
    }
    return parsed as PromptEntity;
  }
}
