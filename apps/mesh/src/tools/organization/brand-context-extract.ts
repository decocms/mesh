import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

/**
 * Map Firecrawl's BrandingProfile to our brand context shape.
 */
const COLOR_ROLES = new Set([
  "primary",
  "secondary",
  "accent",
  "background",
  "foreground",
]);

const FONT_ROLE_MAP: Record<string, string> = {
  heading: "heading",
  headings: "heading",
  head: "heading",
  title: "heading",
  body: "body",
  primary: "body",
  text: "body",
  code: "code",
  monospace: "code",
  mono: "code",
};

function mapFirecrawlBranding(
  branding: Record<string, unknown>,
  metadata: Record<string, unknown>,
): {
  logo: string | null;
  favicon: string | null;
  ogImage: string | null;
  fonts: { heading?: string; body?: string; code?: string } | null;
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    foreground?: string;
  } | null;
  metadata: Record<string, unknown>;
} {
  const images = (branding.images ?? {}) as Record<string, unknown>;

  // Colors: pick known semantic roles from branding.colors
  const rawColors = (branding.colors ?? {}) as Record<string, unknown>;
  const colors: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawColors)) {
    if (typeof value === "string" && value && COLOR_ROLES.has(key)) {
      colors[key] = value;
    }
  }

  // Fonts: map fontFamilies roles to semantic roles
  const fonts: Record<string, string> = {};
  const typography = (branding.typography ?? {}) as Record<string, unknown>;
  const fontFamilies = (typography.fontFamilies ?? {}) as Record<
    string,
    unknown
  >;

  for (const [role, family] of Object.entries(fontFamilies)) {
    if (typeof family === "string" && family) {
      const mapped = FONT_ROLE_MAP[role.toLowerCase()];
      if (mapped && !fonts[mapped]) {
        fonts[mapped] = family;
      }
    }
  }

  // Fallback: additional fonts from the fonts array
  const rawFonts = branding.fonts;
  if (Array.isArray(rawFonts)) {
    for (const f of rawFonts) {
      const family = (f as Record<string, unknown>).family;
      if (typeof family === "string" && family && !fonts.body) {
        fonts.body = family;
      }
    }
  }

  // Rich metadata (typography, components, spacing, layout, tone, personality, etc.)
  const richMetadata: Record<string, unknown> = {};
  for (const key of [
    "typography",
    "components",
    "spacing",
    "layout",
    "animations",
    "icons",
    "tone",
    "personality",
    "colorScheme",
  ]) {
    if (branding[key] !== undefined) {
      richMetadata[key] = branding[key];
    }
  }

  return {
    logo: (images.logo as string) ?? null,
    favicon: (images.favicon as string) ?? null,
    ogImage: (images.ogImage as string) ?? (metadata.ogImage as string) ?? null,
    fonts:
      Object.keys(fonts).length > 0
        ? (fonts as { heading?: string; body?: string; code?: string })
        : null,
    colors:
      Object.keys(colors).length > 0
        ? (colors as {
            primary?: string;
            secondary?: string;
            accent?: string;
            background?: string;
            foreground?: string;
          })
        : null,
    metadata: richMetadata,
  };
}

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

    // Normalize domain to URL
    let url = input.domain.trim();
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    // Call Firecrawl scrape with branding format
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["branding"],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Firecrawl API error: ${response.status} ${text.slice(0, 200)}`,
      );
    }

    const result = (await response.json()) as {
      success?: boolean;
      data?: {
        branding?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
      };
    };

    if (!result.success || !result.data?.branding) {
      throw new Error("Firecrawl did not return branding data for this URL");
    }

    const branding = result.data.branding;
    const metadata = result.data.metadata ?? {};
    const mapped = mapFirecrawlBranding(branding, metadata);

    // Derive name from metadata — prefer the short segment after a separator
    // in the title (e.g. "Visual CMS for Your Storefront | Deco" → "Deco"),
    // then ogSiteName, then the domain as last resort.
    const titleParts = (metadata.title as string)
      ?.split(/[|–—]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const shortestTitlePart = titleParts
      ?.slice()
      .sort((a, b) => a.length - b.length)[0];
    const name =
      shortestTitlePart ?? (metadata.ogSiteName as string) ?? input.domain;

    const brandData = {
      name,
      domain: input.domain,
      overview: (metadata.description as string) ?? "",
      logo: mapped.logo,
      favicon: mapped.favicon,
      ogImage: mapped.ogImage,
      fonts: mapped.fonts,
      colors: mapped.colors,
      images: null,
      metadata:
        Object.keys(mapped.metadata).length > 0 ? mapped.metadata : null,
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
