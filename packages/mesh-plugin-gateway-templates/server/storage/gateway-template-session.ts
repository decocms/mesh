/**
 * Gateway Template Session Storage Implementation
 *
 * Handles CRUD operations for gateway template sessions using Kysely.
 * Sessions track per-user state during the connect flow.
 */

import type { Kysely, Insertable, Updateable } from "kysely";
import { generatePrefixedId } from "./utils";
import type {
  GatewayTemplateSessionEntity,
  GatewayTemplateSessionCreateInput,
  GatewayTemplateSessionUpdateInput,
  GatewayTemplatesDatabase,
  AppStatus,
} from "./types";

/** Raw database row type */
type RawSessionRow = {
  id: string;
  template_id: string;
  organization_id: string;
  external_user_id: string;
  status: string;
  app_statuses: string;
  created_agent_id: string | null;
  redirect_url: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export class GatewayTemplateSessionStorage {
  constructor(private db: Kysely<GatewayTemplatesDatabase>) {}

  /**
   * Create a new session
   */
  async create(
    data: GatewayTemplateSessionCreateInput,
  ): Promise<GatewayTemplateSessionEntity> {
    const id = generatePrefixedId("gtsess");
    const now = new Date().toISOString();

    const row: Insertable<
      GatewayTemplatesDatabase["gateway_template_sessions"]
    > = {
      id,
      template_id: data.template_id,
      organization_id: data.organization_id,
      external_user_id: data.external_user_id,
      status: "pending",
      app_statuses: "{}",
      created_agent_id: data.created_agent_id ?? null,
      redirect_url: data.redirect_url ?? null,
      created_at: now,
      updated_at: now,
      expires_at: data.expires_at,
    };

    await this.db.insertInto("gateway_template_sessions").values(row).execute();

    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Failed to create session with id: ${id}`);
    }

    return session;
  }

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<GatewayTemplateSessionEntity | null> {
    const row = await this.db
      .selectFrom("gateway_template_sessions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserialize(row as unknown as RawSessionRow);
  }

  /**
   * Find an existing session for a user and template
   * Returns the most recent non-expired session if one exists
   */
  async findExisting(
    templateId: string,
    externalUserId: string,
  ): Promise<GatewayTemplateSessionEntity | null> {
    const now = new Date().toISOString();

    const row = await this.db
      .selectFrom("gateway_template_sessions")
      .selectAll()
      .where("template_id", "=", templateId)
      .where("external_user_id", "=", externalUserId)
      .where("expires_at", ">", now)
      .where("status", "!=", "completed")
      .orderBy("created_at", "desc")
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.deserialize(row as unknown as RawSessionRow);
  }

  /**
   * List sessions for a template
   */
  async listByTemplate(
    templateId: string,
  ): Promise<GatewayTemplateSessionEntity[]> {
    const rows = await this.db
      .selectFrom("gateway_template_sessions")
      .selectAll()
      .where("template_id", "=", templateId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => this.deserialize(row as unknown as RawSessionRow));
  }

  /**
   * List sessions for an organization
   */
  async listByOrganization(
    organizationId: string,
  ): Promise<GatewayTemplateSessionEntity[]> {
    const rows = await this.db
      .selectFrom("gateway_template_sessions")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => this.deserialize(row as unknown as RawSessionRow));
  }

  /**
   * Update a session
   */
  async update(
    id: string,
    data: GatewayTemplateSessionUpdateInput,
  ): Promise<GatewayTemplateSessionEntity> {
    const now = new Date().toISOString();

    const updates: Updateable<
      GatewayTemplatesDatabase["gateway_template_sessions"]
    > = {
      updated_at: now,
    };

    if (data.status !== undefined) updates.status = data.status;
    if (data.app_statuses !== undefined) {
      updates.app_statuses = JSON.stringify(data.app_statuses);
    }
    if (data.created_agent_id !== undefined) {
      updates.created_agent_id = data.created_agent_id;
    }

    await this.db
      .updateTable("gateway_template_sessions")
      .set(updates)
      .where("id", "=", id)
      .execute();

    const session = await this.findById(id);
    if (!session) {
      throw new Error(`Session not found after update: ${id}`);
    }

    return session;
  }

  /**
   * Delete a session
   */
  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom("gateway_template_sessions")
      .where("id", "=", id)
      .execute();
  }

  /**
   * Delete expired sessions (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .deleteFrom("gateway_template_sessions")
      .where("expires_at", "<", now)
      .where("status", "!=", "completed")
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }

  /**
   * Deserialize a database row to entity
   */
  private deserialize(row: RawSessionRow): GatewayTemplateSessionEntity {
    let appStatuses: Record<string, AppStatus> = {};
    try {
      appStatuses = JSON.parse(row.app_statuses);
    } catch {
      appStatuses = {};
    }

    return {
      id: row.id,
      template_id: row.template_id,
      organization_id: row.organization_id,
      external_user_id: row.external_user_id,
      status: row.status as "pending" | "in_progress" | "completed",
      app_statuses: appStatuses,
      created_agent_id: row.created_agent_id,
      redirect_url: row.redirect_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
    };
  }
}
