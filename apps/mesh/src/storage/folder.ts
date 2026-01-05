/**
 * Folder Storage Implementation
 *
 * Handles CRUD operations for folders using Kysely (database-agnostic).
 * Folders are organization-scoped and can contain connections and/or gateways.
 */

import type { Kysely } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  FolderCreateData,
  FolderStoragePort,
  FolderUpdateData,
} from "./ports";
import type { Database, Folder, FolderType } from "./types";

/** Raw database row type for folders */
type RawFolderRow = {
  id: string;
  organization_id: string;
  type: FolderType;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string;
};

export class FolderStorage implements FolderStoragePort {
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: FolderCreateData,
  ): Promise<Folder> {
    const id = generatePrefixedId("folder");
    const now = new Date().toISOString();

    await this.db
      .insertInto("folders")
      .values({
        id,
        organization_id: organizationId,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
        sort_order: data.sortOrder ?? 0,
        created_at: now,
        updated_at: now,
        created_by: userId,
      })
      .execute();

    const folder = await this.findById(id);
    if (!folder) {
      throw new Error(`Failed to create folder with id: ${id}`);
    }

    return folder;
  }

  async findById(id: string): Promise<Folder | null> {
    const row = await this.db
      .selectFrom("folders")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.deserializeFolder(row as unknown as RawFolderRow) : null;
  }

  async list(organizationId: string, type: FolderType): Promise<Folder[]> {
    const rows = await this.db
      .selectFrom("folders")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("type", "=", type)
      .orderBy("sort_order", "asc")
      .orderBy("title", "asc")
      .execute();

    return rows.map((row) =>
      this.deserializeFolder(row as unknown as RawFolderRow),
    );
  }

  async update(id: string, data: FolderUpdateData): Promise<Folder> {
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.icon !== undefined) {
      updateData.icon = data.icon;
    }
    if (data.color !== undefined) {
      updateData.color = data.color;
    }
    if (data.sortOrder !== undefined) {
      updateData.sort_order = data.sortOrder;
    }

    await this.db
      .updateTable("folders")
      .set(updateData)
      .where("id", "=", id)
      .execute();

    const folder = await this.findById(id);
    if (!folder) {
      throw new Error("Folder not found after update");
    }

    return folder;
  }

  async delete(id: string): Promise<void> {
    // Remove folder_id from all connections in this folder
    await this.db
      .updateTable("connections")
      .set({ folder_id: null })
      .where("folder_id", "=", id)
      .execute();

    // Remove folder_id from all gateways in this folder
    await this.db
      .updateTable("gateways")
      .set({ folder_id: null })
      .where("folder_id", "=", id)
      .execute();

    // Delete the folder
    await this.db.deleteFrom("folders").where("id", "=", id).execute();
  }

  /**
   * Deserialize folder row to entity
   */
  private deserializeFolder(row: RawFolderRow): Folder {
    return {
      id: row.id,
      organizationId: row.organization_id,
      type: row.type,
      title: row.title,
      description: row.description,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sort_order,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      createdBy: row.created_by,
    };
  }
}
