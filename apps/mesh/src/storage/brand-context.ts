import type { Kysely } from "kysely";
import type { BrandContextStoragePort } from "./ports";
import type { BrandContext, Database } from "./types";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toEntity(
  record: Record<string, unknown> & {
    id: string;
    organization_id: string;
    name: string;
    domain: string;
    overview: string;
    logo: string | null;
    favicon: string | null;
    og_image: string | null;
    fonts: string | null;
    colors: string | null;
    images: string | null;
    metadata: string | null;
    archived_at: Date | null;
    is_default: boolean;
    created_at: Date;
    updated_at: Date;
  },
): BrandContext {
  return {
    id: record.id,
    organizationId: record.organization_id,
    name: record.name,
    domain: record.domain,
    overview: record.overview,
    logo: record.logo,
    favicon: record.favicon,
    ogImage: record.og_image,
    fonts: parseJson(record.fonts),
    colors: parseJson(record.colors),
    images: parseJson(record.images),
    metadata: parseJson(record.metadata),
    archivedAt: record.archived_at,
    isDefault: record.is_default,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export class BrandContextStorage implements BrandContextStoragePort {
  constructor(private readonly db: Kysely<Database>) {}

  async get(id: string, organizationId: string): Promise<BrandContext | null> {
    const record = await this.db
      .selectFrom("brand_context")
      .selectAll()
      .where("id", "=", id)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();

    if (!record) return null;
    return toEntity(record);
  }

  async list(
    organizationId: string,
    options?: { includeArchived?: boolean },
  ): Promise<BrandContext[]> {
    let query = this.db
      .selectFrom("brand_context")
      .selectAll()
      .where("organization_id", "=", organizationId);

    if (!options?.includeArchived) {
      query = query.where("archived_at", "is", null);
    }

    const records = await query.orderBy("created_at", "asc").execute();
    return records.map(toEntity);
  }

  async create(
    organizationId: string,
    data: Omit<
      BrandContext,
      | "id"
      | "organizationId"
      | "archivedAt"
      | "isDefault"
      | "createdAt"
      | "updatedAt"
    >,
  ): Promise<BrandContext> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .insertInto("brand_context")
      .values({
        id,
        organization_id: organizationId,
        name: data.name,
        domain: data.domain,
        overview: data.overview,
        logo: data.logo,
        favicon: data.favicon,
        og_image: data.ogImage,
        fonts: data.fonts ? JSON.stringify(data.fonts) : null,
        colors: data.colors ? JSON.stringify(data.colors) : null,
        images: data.images ? JSON.stringify(data.images) : null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        archived_at: null,
        is_default: false,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const result = await this.get(id, organizationId);
    return result!;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<
      Omit<BrandContext, "id" | "organizationId" | "createdAt" | "updatedAt">
    >,
  ): Promise<BrandContext> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.name !== undefined) updates.name = data.name;
    if (data.domain !== undefined) updates.domain = data.domain;
    if (data.overview !== undefined) updates.overview = data.overview;
    if (data.logo !== undefined) updates.logo = data.logo;
    if (data.favicon !== undefined) updates.favicon = data.favicon;
    if (data.ogImage !== undefined) updates.og_image = data.ogImage;
    if (data.fonts !== undefined)
      updates.fonts = data.fonts ? JSON.stringify(data.fonts) : null;
    if (data.colors !== undefined)
      updates.colors = data.colors ? JSON.stringify(data.colors) : null;
    if (data.images !== undefined)
      updates.images = data.images ? JSON.stringify(data.images) : null;
    if (data.metadata !== undefined)
      updates.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
    if (data.archivedAt !== undefined)
      updates.archived_at = data.archivedAt ?? null;
    if (data.isDefault !== undefined) updates.is_default = data.isDefault;

    await this.db
      .updateTable("brand_context")
      .set(updates)
      .where("id", "=", id)
      .where("organization_id", "=", organizationId)
      .execute();

    const result = await this.get(id, organizationId);
    if (!result) throw new Error("Brand context not found");
    return result;
  }

  async getDefault(organizationId: string): Promise<BrandContext | null> {
    const record = await this.db
      .selectFrom("brand_context")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("is_default", "=", true)
      .where("archived_at", "is", null)
      .executeTakeFirst();

    if (!record) return null;
    return toEntity(record);
  }

  async setDefault(id: string, organizationId: string): Promise<BrandContext> {
    await this.db.transaction().execute(async (trx) => {
      // Clear all defaults for this org
      await trx
        .updateTable("brand_context")
        .set({ is_default: false })
        .where("organization_id", "=", organizationId)
        .where("is_default", "=", true)
        .execute();

      // Set the new default
      await trx
        .updateTable("brand_context")
        .set({ is_default: true, updated_at: new Date().toISOString() })
        .where("id", "=", id)
        .where("organization_id", "=", organizationId)
        .execute();
    });

    const result = await this.get(id, organizationId);
    if (!result) throw new Error("Brand context not found");
    return result;
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.db
      .deleteFrom("brand_context")
      .where("id", "=", id)
      .where("organization_id", "=", organizationId)
      .execute();
  }
}
