import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { BrandContextSchema } from "./schema.ts";

const BrandContextOutput = BrandContextSchema.extend({
  organizationId: z.string(),
  createdAt: z.string().describe("ISO 8601 timestamp"),
  updatedAt: z.string().describe("ISO 8601 timestamp"),
});

export const BRAND_CONTEXT_CREATE = defineTool({
  name: "BRAND_CONTEXT_CREATE",
  description:
    "Create a new brand context (company profile) for the current organization.",
  annotations: {
    title: "Create Brand Context",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: BrandContextSchema.omit({ id: true }),

  outputSchema: BrandContextOutput,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();
    const organizationId = ctx.organization?.id;
    if (!organizationId) {
      throw new Error(
        "Organization ID required (no active organization in context)",
      );
    }

    const brand = await ctx.storage.brandContext.create(organizationId, {
      name: input.name,
      domain: input.domain,
      overview: input.overview,
      logo: input.logo ?? null,
      favicon: input.favicon ?? null,
      ogImage: input.ogImage ?? null,
      fonts: (input.fonts as Record<string, unknown>[] | null) ?? null,
      colors: (input.colors as Record<string, unknown> | null) ?? null,
      images: (input.images as Record<string, unknown>[] | null) ?? null,
    });

    return {
      ...brand,
      createdAt:
        brand.createdAt instanceof Date
          ? brand.createdAt.toISOString()
          : brand.createdAt,
      updatedAt:
        brand.updatedAt instanceof Date
          ? brand.updatedAt.toISOString()
          : brand.updatedAt,
    };
  },
});

export const BRAND_CONTEXT_UPDATE = defineTool({
  name: "BRAND_CONTEXT_UPDATE",
  description: "Update an existing brand context by ID.",
  annotations: {
    title: "Update Brand Context",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: BrandContextSchema.partial().required({ id: true }),

  outputSchema: BrandContextOutput,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const { id, ...data } = input;
    const brand = await ctx.storage.brandContext.update(id, {
      name: data.name,
      domain: data.domain,
      overview: data.overview,
      logo: data.logo ?? undefined,
      favicon: data.favicon ?? undefined,
      ogImage: data.ogImage ?? undefined,
      fonts:
        data.fonts !== undefined
          ? ((data.fonts as Record<string, unknown>[] | null) ?? null)
          : undefined,
      colors:
        data.colors !== undefined
          ? ((data.colors as Record<string, unknown> | null) ?? null)
          : undefined,
      images:
        data.images !== undefined
          ? ((data.images as Record<string, unknown>[] | null) ?? null)
          : undefined,
    });

    return {
      ...brand,
      createdAt:
        brand.createdAt instanceof Date
          ? brand.createdAt.toISOString()
          : brand.createdAt,
      updatedAt:
        brand.updatedAt instanceof Date
          ? brand.updatedAt.toISOString()
          : brand.updatedAt,
    };
  },
});

export const BRAND_CONTEXT_DELETE = defineTool({
  name: "BRAND_CONTEXT_DELETE",
  description: "Delete a brand context by ID.",
  annotations: {
    title: "Delete Brand Context",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({
    id: z.string().describe("Brand context ID"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    await ctx.storage.brandContext.delete(input.id);
    return { success: true };
  },
});
