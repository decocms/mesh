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

export class BrandContextStorage implements BrandContextStoragePort {
  constructor(private readonly db: Kysely<Database>) {}

  async get(organizationId: string): Promise<BrandContext | null> {
    const record = await this.db
      .selectFrom("brand_context")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();

    if (!record) return null;

    return {
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

  async upsert(
    organizationId: string,
    data: Omit<BrandContext, "organizationId" | "createdAt" | "updatedAt">,
  ): Promise<BrandContext> {
    const now = new Date().toISOString();
    const fontsJson = data.fonts ? JSON.stringify(data.fonts) : null;
    const colorsJson = data.colors ? JSON.stringify(data.colors) : null;
    const imagesJson = data.images ? JSON.stringify(data.images) : null;

    await this.db
      .insertInto("brand_context")
      .values({
        organization_id: organizationId,
        name: data.name,
        domain: data.domain,
        overview: data.overview,
        logo: data.logo,
        favicon: data.favicon,
        og_image: data.ogImage,
        fonts: fontsJson,
        colors: colorsJson,
        images: imagesJson,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column("organization_id").doUpdateSet({
          name: data.name,
          domain: data.domain,
          overview: data.overview,
          logo: data.logo,
          favicon: data.favicon,
          og_image: data.ogImage,
          fonts: fontsJson,
          colors: colorsJson,
          images: imagesJson,
          updated_at: now,
        }),
      )
      .execute();

    const result = await this.get(organizationId);
    if (!result) {
      return {
        organizationId,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
    }
    return result;
  }

  async delete(organizationId: string): Promise<void> {
    await this.db
      .deleteFrom("brand_context")
      .where("organization_id", "=", organizationId)
      .execute();
  }
}
