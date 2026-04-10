import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { extractBrandFromDomain } from "../../auth/extract-brand";

export const BRAND_CONTEXT_EXTRACT = defineTool({
  name: "BRAND_CONTEXT_EXTRACT",
  description:
    "Extract brand context (colors, fonts, logos) from a website URL using Firecrawl.",
  annotations: {
    title: "Extract Brand Context",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: z.object({
    domain: z.string().describe("Website domain to extract brand from"),
    brandId: z
      .string()
      .optional()
      .describe("Existing brand context ID to update (creates new if omitted)"),
  }),

  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    domain: z.string(),
    success: z.boolean(),
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

    const apiKey = ctx.firecrawlApiKey;
    if (!apiKey) {
      throw new Error(
        "FIRECRAWL_API_KEY is not configured. Set the environment variable to enable brand extraction.",
      );
    }

    const extracted = await extractBrandFromDomain(
      input.domain,
      apiKey,
      input.domain,
    );
    if (!extracted) {
      throw new Error("Firecrawl did not return branding data for this URL");
    }

    const brandData = {
      name: extracted.name,
      domain: extracted.domain,
      overview: extracted.overview,
      logo: extracted.logo,
      favicon: extracted.favicon,
      ogImage: extracted.ogImage,
      fonts: extracted.fonts,
      colors: extracted.colors,
      images: extracted.images,
      metadata: extracted.metadata,
    };

    // Update existing or create new
    if (input.brandId) {
      const existing = await ctx.storage.brandContext.get(
        input.brandId,
        organizationId,
      );
      if (!existing) {
        throw new Error("Brand context not found");
      }
      const updated = await ctx.storage.brandContext.update(
        input.brandId,
        organizationId,
        brandData,
      );
      return {
        id: updated.id,
        name: updated.name,
        domain: updated.domain,
        success: true,
      };
    }

    const created = await ctx.storage.brandContext.create(
      organizationId,
      brandData,
    );
    return {
      id: created.id,
      name: created.name,
      domain: created.domain,
      success: true,
    };
  },
});
