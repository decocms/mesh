/**
 * User Sandbox Storage Implementation
 *
 * Handles CRUD operations for user sandbox using Kysely.
 */

import type { Kysely, Insertable, Updateable } from "kysely";
import { generatePrefixedId } from "./utils";
import type {
  UserSandboxEntity,
  UserSandboxCreateInput,
  UserSandboxUpdateInput,
  UserSandboxDatabase,
  RequiredApp,
} from "./types";

/** Raw database row type */
type RawTemplateRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  required_apps: string;
  redirect_url: string | null;
  webhook_url: string | null;
  event_type: string;
  agent_title_template: string;
  agent_instructions: string | null;
  tool_selection_mode: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export class UserSandboxStorage {
  constructor(private db: Kysely<UserSandboxDatabase>) {}

  /**
   * Create a new user sandbox
   */
  async create(data: UserSandboxCreateInput): Promise<UserSandboxEntity> {
    const id = generatePrefixedId("gtpl");
    const now = new Date().toISOString();

    const row: Insertable<UserSandboxDatabase["user_sandbox"]> = {
      id,
      organization_id: data.organization_id,
      title: data.title,
      description: data.description ?? null,
      icon: data.icon ?? null,
      required_apps: JSON.stringify(data.required_apps),
      redirect_url: data.redirect_url ?? null,
      webhook_url: data.webhook_url ?? null,
      event_type: data.event_type ?? "integration.completed",
      agent_title_template:
        data.agent_title_template ?? "{{externalUserId}}'s Agent",
      agent_instructions: data.agent_instructions ?? null,
      tool_selection_mode: data.tool_selection_mode ?? "inclusion",
      status: "active",
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
    };

    await this.db.insertInto("user_sandbox").values(row).execute();

    const template = await this.findById(id);
    if (!template) {
      throw new Error(`Failed to create user sandbox with id: ${id}`);
    }

    return template;
  }

  /**
   * Find a template by ID
   */
  async findById(id: string): Promise<UserSandboxEntity | null> {
    const row = await this.db
      .selectFrom("user_sandbox")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserialize(row as unknown as RawTemplateRow);
  }

  /**
   * List templates for an organization
   */
  async list(organizationId: string): Promise<UserSandboxEntity[]> {
    const rows = await this.db
      .selectFrom("user_sandbox")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) =>
      this.deserialize(row as unknown as RawTemplateRow),
    );
  }

  /**
   * Update a template
   */
  async update(
    id: string,
    data: UserSandboxUpdateInput,
  ): Promise<UserSandboxEntity> {
    const now = new Date().toISOString();

    const updates: Updateable<UserSandboxDatabase["user_sandbox"]> = {
      updated_at: now,
    };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.required_apps !== undefined) {
      updates.required_apps = JSON.stringify(data.required_apps);
    }
    if (data.redirect_url !== undefined)
      updates.redirect_url = data.redirect_url;
    if (data.webhook_url !== undefined) updates.webhook_url = data.webhook_url;
    if (data.event_type !== undefined) updates.event_type = data.event_type;
    if (data.agent_title_template !== undefined) {
      updates.agent_title_template = data.agent_title_template;
    }
    if (data.agent_instructions !== undefined) {
      updates.agent_instructions = data.agent_instructions;
    }
    if (data.tool_selection_mode !== undefined) {
      updates.tool_selection_mode = data.tool_selection_mode;
    }
    if (data.status !== undefined) updates.status = data.status;

    await this.db
      .updateTable("user_sandbox")
      .set(updates)
      .where("id", "=", id)
      .execute();

    const template = await this.findById(id);
    if (!template) {
      throw new Error(`Template not found after update: ${id}`);
    }

    return template;
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("user_sandbox").where("id", "=", id).execute();
  }

  /**
   * Deserialize a database row to entity
   */
  private deserialize(row: RawTemplateRow): UserSandboxEntity {
    let requiredApps: RequiredApp[] = [];
    try {
      requiredApps = JSON.parse(row.required_apps);
    } catch {
      requiredApps = [];
    }

    return {
      id: row.id,
      organization_id: row.organization_id,
      title: row.title,
      description: row.description,
      icon: row.icon,
      required_apps: requiredApps,
      redirect_url: row.redirect_url,
      webhook_url: row.webhook_url,
      event_type: row.event_type,
      agent_title_template: row.agent_title_template,
      agent_instructions: row.agent_instructions,
      tool_selection_mode: row.tool_selection_mode as "inclusion" | "exclusion",
      status: row.status as "active" | "inactive",
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
    };
  }
}
