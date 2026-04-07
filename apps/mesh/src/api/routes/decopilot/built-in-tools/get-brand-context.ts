/**
 * get_brand_context Built-in Tool
 *
 * Always-available tool that returns the organization's default brand context.
 * Agents call this when they need brand identity info (colors, fonts, logos, etc.)
 * instead of having it injected into every system prompt.
 */

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { tool, zodSchema } from "ai";
import { z } from "zod";

const GetBrandContextOutputSchema = z.object({
  name: z.string(),
  domain: z.string(),
  overview: z.string(),
  logo: z.string().nullable(),
  favicon: z.string().nullable(),
  ogImage: z.string().nullable(),
  fonts: z.array(z.record(z.string(), z.unknown())).nullable(),
  colors: z
    .union([
      z.array(z.record(z.string(), z.unknown())),
      z.record(z.string(), z.unknown()),
    ])
    .nullable(),
  images: z.array(z.record(z.string(), z.unknown())).nullable(),
});

export function createGetBrandContextTool(
  params: { organization: OrganizationScope },
  ctx: MeshContext,
) {
  return tool({
    description:
      "Get the organization's default brand context — name, domain, overview, " +
      "colors, fonts, logos, and images. Call this when you need brand identity " +
      "information for the task (e.g. writing copy, designing UI, generating assets). " +
      "Read-only, always available.",
    inputSchema: zodSchema(z.object({})),
    outputSchema: zodSchema(GetBrandContextOutputSchema),
    execute: async () => {
      const brand = await ctx.storage.brandContext.getDefault(
        params.organization.id,
      );

      if (!brand) {
        throw new Error(
          "No default brand context configured for this organization.",
        );
      }

      return {
        name: brand.name,
        domain: brand.domain,
        overview: brand.overview,
        logo: brand.logo,
        favicon: brand.favicon,
        ogImage: brand.ogImage,
        fonts: brand.fonts,
        colors: brand.colors,
        images: brand.images,
      };
    },
  });
}
