/**
 * Projects Storage
 *
 * Storage layer for organization-scoped projects.
 * Projects are the primary workspace within organizations.
 */

import type { Kysely } from "kysely";
import type { Database, Project, ProjectUI } from "./types";
import type { ProjectStoragePort } from "./ports";
import { generatePrefixedId } from "@/shared/utils/generate-id";

export class ProjectsStorage implements ProjectStoragePort {
  constructor(private readonly db: Kysely<Database>) {}

  private parseRow(row: {
    id: string;
    organization_id: string;
    slug: string;
    name: string;
    description: string | null;
    enabled_plugins: string | string[] | null;
    ui: string | ProjectUI | null;
    created_at: Date | string;
    updated_at: Date | string;
  }): Project {
    return {
      id: row.id,
      organizationId: row.organization_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      enabledPlugins: row.enabled_plugins
        ? typeof row.enabled_plugins === "string"
          ? JSON.parse(row.enabled_plugins)
          : row.enabled_plugins
        : null,
      ui: row.ui
        ? typeof row.ui === "string"
          ? JSON.parse(row.ui)
          : row.ui
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(organizationId: string): Promise<Project[]> {
    const rows = await this.db
      .selectFrom("projects")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map((row) => this.parseRow(row));
  }

  async get(projectId: string): Promise<Project | null> {
    const row = await this.db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", projectId)
      .executeTakeFirst();
    return row ? this.parseRow(row) : null;
  }

  async getBySlug(
    organizationId: string,
    slug: string,
  ): Promise<Project | null> {
    const row = await this.db
      .selectFrom("projects")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("slug", "=", slug)
      .executeTakeFirst();
    return row ? this.parseRow(row) : null;
  }

  async create(data: {
    organizationId: string;
    slug: string;
    name: string;
    description?: string | null;
    enabledPlugins?: string[] | null;
    ui?: ProjectUI | null;
  }): Promise<Project> {
    const now = new Date().toISOString();
    const id = generatePrefixedId("proj");

    await this.db
      .insertInto("projects")
      .values({
        id,
        organization_id: data.organizationId,
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        enabled_plugins: data.enabledPlugins
          ? JSON.stringify(data.enabledPlugins)
          : null,
        ui: data.ui ? JSON.stringify(data.ui) : null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const project = await this.get(id);
    if (!project) {
      throw new Error("Failed to create project");
    }
    return project;
  }

  async update(
    projectId: string,
    data: Partial<{
      name: string;
      description: string | null;
      enabledPlugins: string[] | null;
      ui: ProjectUI | null;
    }>,
  ): Promise<Project | null> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.enabledPlugins !== undefined) {
      updateData.enabled_plugins = data.enabledPlugins
        ? JSON.stringify(data.enabledPlugins)
        : null;
    }
    if (data.ui !== undefined) {
      updateData.ui = data.ui ? JSON.stringify(data.ui) : null;
    }

    await this.db
      .updateTable("projects")
      .set(updateData)
      .where("id", "=", projectId)
      .execute();

    return this.get(projectId);
  }

  async delete(projectId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("projects")
      .where("id", "=", projectId)
      .executeTakeFirst();
    return (result.numDeletedRows ?? 0n) > 0n;
  }
}
