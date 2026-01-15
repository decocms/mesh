/**
 * Resource Storage Implementation
 *
 * Handles CRUD operations for stored resources using Kysely.
 * All resources are organization-scoped.
 */

import type { Insertable, Kysely, Updateable } from "kysely";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import type {
  ResourceCreateData,
  ResourceEntity,
  ResourceUpdateData,
} from "../tools/resource/schema";
import type { ResourceStoragePort } from "./ports";
import type { Database } from "./types";

type RawResourceRow = ResourceEntity;

export class ResourceStorage implements ResourceStoragePort {
  constructor(private db: Kysely<Database>) {}

  async create(
    organizationId: string,
    userId: string,
    data: ResourceCreateData,
  ): Promise<ResourceEntity> {
    const id = generatePrefixedId("res");
    const now = new Date().toISOString();

    await this.db
      .insertInto("resources")
      .values({
        id,
        organization_id: organizationId,
        title: data.title,
        description: data.description ?? null,
        uri: data.uri,
        name: data.name,
        mime_type: data.mime_type ?? null,
        text: data.text ?? null,
        blob: data.blob ?? null,
        created_at: now,
        updated_at: now,
        created_by: userId,
        updated_by: null,
      } as Insertable<Database["resources"]>)
      .execute();

    const resource = await this.findById(id, organizationId);
    if (!resource) {
      throw new Error(`Failed to create resource with id: ${id}`);
    }
    return resource;
  }

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<ResourceEntity | null> {
    let query = this.db
      .selectFrom("resources")
      .selectAll()
      .where("id", "=", id);
    if (organizationId) {
      query = query.where("organization_id", "=", organizationId);
    }
    const row = await query.executeTakeFirst();
    return row ? (row as RawResourceRow) : null;
  }

  async list(organizationId: string): Promise<ResourceEntity[]> {
    const rows = await this.db
      .selectFrom("resources")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
    return rows as RawResourceRow[];
  }

  async update(
    id: string,
    userId: string,
    data: ResourceUpdateData,
  ): Promise<ResourceEntity> {
    if (Object.keys(data).length === 0) {
      const resource = await this.findById(id);
      if (!resource) throw new Error("Resource not found");
      return resource;
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description ?? null;
    if (data.uri !== undefined) updateData.uri = data.uri;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.mime_type !== undefined)
      updateData.mime_type = data.mime_type ?? null;
    if (data.text !== undefined) updateData.text = data.text ?? null;
    if (data.blob !== undefined) updateData.blob = data.blob ?? null;

    await this.db
      .updateTable("resources")
      .set(updateData as Updateable<Database["resources"]>)
      .where("id", "=", id)
      .execute();

    const resource = await this.findById(id);
    if (!resource) {
      throw new Error("Resource not found after update");
    }
    return resource;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("resources").where("id", "=", id).execute();
  }
}
