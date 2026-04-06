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
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export class BrandContextStorage implements BrandContextStoragePort {
  constructor(private readonly db: Kysely<Database>) {}

  async get(id: string): Promise<BrandContext | null> {
    const record = await this.db
      .selectFrom("brand_context")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!record) return null;
    return toEntity(record);
  }

  async list(organizationId: string): Promise<BrandContext[]> {
    const records = await this.db
      .selectFrom("brand_context")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("created_at", "asc")
      .execute();

    return records.map(toEntity);
  }

  async create(
    organizationId: string,
    data: Omit<
      BrandContext,
      "id" | "organizationId" | "createdAt" | "updatedAt"
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
        created_at: now,
        updated_at: now,
      })
      .execute();

    const result = await this.get(id);
    return result!;
  }

  async update(
    id: string,
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

    await this.db
      .updateTable("brand_context")
      .set(updates)
      .where("id", "=", id)
      .execute();

    const result = await this.get(id);
    if (!result) throw new Error("Brand context not found");
    return result;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("brand_context").where("id", "=", id).execute();
  }
}
