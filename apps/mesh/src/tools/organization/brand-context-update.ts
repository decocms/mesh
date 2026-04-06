import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { BrandContextSchema } from "./schema.ts";

export const BRAND_CONTEXT_UPDATE = defineTool({
  name: "BRAND_CONTEXT_UPDATE",
  description:
    "Create or update the brand context (company profile) for the current organization.",
  annotations: {
    title: "Update Brand Context",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: BrandContextSchema,

  outputSchema: BrandContextSchema.extend({
    organizationId: z.string(),
    createdAt: z.string().describe("ISO 8601 timestamp"),
    updatedAt: z.string().describe("ISO 8601 timestamp"),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();
    const organizationId = ctx.organization?.id;
    if (!organizationId) {
      throw new Error(
        "Organization ID required (no active organization in context)",
      );
    }

    const brandContext = await ctx.storage.brandContext.upsert(organizationId, {
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
      ...brandContext,
      createdAt:
        brandContext.createdAt instanceof Date
          ? brandContext.createdAt.toISOString()
          : brandContext.createdAt,
      updatedAt:
        brandContext.updatedAt instanceof Date
          ? brandContext.updatedAt.toISOString()
          : brandContext.updatedAt,
    };
  },
});
