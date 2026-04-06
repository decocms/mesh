import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { BrandContextSchema } from "./schema.ts";

export const BRAND_CONTEXT_GET = defineTool({
  name: "BRAND_CONTEXT_GET",
  description:
    "Get the brand context (company profile) for the current organization.",
  annotations: {
    title: "Get Brand Context",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({}),

  outputSchema: BrandContextSchema.extend({
    organizationId: z.string(),
    createdAt: z.string().datetime().optional().describe("ISO 8601 timestamp"),
    updatedAt: z.string().datetime().optional().describe("ISO 8601 timestamp"),
  })
    .partial()
    .required({ organizationId: true }),

  handler: async (_, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();
    const organizationId = ctx.organization?.id;
    if (!organizationId) {
      throw new Error(
        "Organization ID required (no active organization in context)",
      );
    }

    const brandContext = await ctx.storage.brandContext.get(organizationId);

    if (!brandContext) {
      return { organizationId };
    }

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
