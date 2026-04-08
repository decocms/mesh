/**
 * Brand Well-Known Binding
 *
 * Defines the interface for reading brand context (colors, fonts, assets,
 * voice) from an organization. External MCPs that need brand awareness
 * can declare a dependency on this binding and call BRAND_GET / BRAND_LIST
 * to pull structured brand data on demand.
 *
 * This binding includes:
 * - BRAND_GET: Get a brand by ID (or the org default)
 * - BRAND_LIST: List all active brands (optional)
 */

import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";

// ============================================================================
// Brand Sub-Schemas
// ============================================================================

export const BrandColorsSchema = z.object({
  primary: z.string().optional().describe("Primary brand color (hex)"),
  secondary: z.string().optional().describe("Secondary brand color (hex)"),
  accent: z.string().optional().describe("Accent / highlight color (hex)"),
  background: z.string().optional().describe("Background color (hex)"),
  foreground: z.string().optional().describe("Foreground / text color (hex)"),
});

export type BrandColors = z.infer<typeof BrandColorsSchema>;

export const BrandFontsSchema = z.object({
  heading: z.string().optional().describe("Font family for headings"),
  body: z.string().optional().describe("Font family for body text"),
  code: z.string().optional().describe("Font family for code / monospace"),
});

export type BrandFonts = z.infer<typeof BrandFontsSchema>;

export const BrandAssetsSchema = z.object({
  logo: z.string().optional().describe("Logo URL"),
  favicon: z.string().optional().describe("Favicon URL"),
  ogImage: z.string().optional().describe("Open Graph image URL"),
});

export type BrandAssets = z.infer<typeof BrandAssetsSchema>;

// ============================================================================
// Brand Schema
// ============================================================================

export const BrandSchema = z.object({
  id: z.string(),
  name: z.string().describe("Brand / company name"),
  domain: z.string().optional().describe("Company domain (e.g. example.com)"),
  colors: BrandColorsSchema.optional().describe("Semantic color palette"),
  fonts: BrandFontsSchema.optional().describe("Font families by role"),
  assets: BrandAssetsSchema.optional().describe("Visual identity assets"),
  overview: z.string().optional().describe("Company overview / description"),
  tagline: z.string().optional().describe("Brand tagline"),
  tone: z.string().optional().describe("Tone of voice description"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Extra design tokens and metadata"),
});

export type Brand = z.infer<typeof BrandSchema>;

// ============================================================================
// BRAND_GET Schemas
// ============================================================================

export const BrandGetInputSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Brand ID. Omit to get the default brand."),
});

export type BrandGetInput = z.infer<typeof BrandGetInputSchema>;

export const BrandGetOutputSchema = BrandSchema;

export type BrandGetOutput = z.infer<typeof BrandGetOutputSchema>;

// ============================================================================
// BRAND_LIST Schemas
// ============================================================================

export const BrandListInputSchema = z.object({});

export type BrandListInput = z.infer<typeof BrandListInputSchema>;

export const BrandListOutputSchema = z.object({
  items: z.array(BrandSchema),
});

export type BrandListOutput = z.infer<typeof BrandListOutputSchema>;

// ============================================================================
// Brand Binding
// ============================================================================

/**
 * Brand Binding
 *
 * Defines the interface for reading brand context from an organization.
 *
 * Required tools:
 * - BRAND_GET: Get a single brand by ID, or the default brand when no ID
 *
 * Optional tools:
 * - BRAND_LIST: List all active brands
 */
export const BRAND_BINDING = [
  {
    name: "BRAND_GET" as const,
    inputSchema: BrandGetInputSchema,
    outputSchema: BrandGetOutputSchema,
  },
  {
    name: "BRAND_LIST" as const,
    inputSchema: BrandListInputSchema,
    outputSchema: BrandListOutputSchema,
    opt: true,
  },
] satisfies ToolBinder[];

/**
 * Brand Binding Client
 *
 * @example
 * ```typescript
 * import { BrandBinding } from "@decocms/bindings/brand";
 *
 * const client = BrandBinding.forConnection(connection);
 *
 * // Get the default brand
 * const brand = await client.BRAND_GET({});
 *
 * // Get a specific brand
 * const brand = await client.BRAND_GET({ id: "acme-corp" });
 *
 * // List all brands
 * const { items } = await client.BRAND_LIST({});
 * ```
 */
export const BrandBinding = bindingClient(BRAND_BINDING);

/**
 * Type helper for the Brand binding client
 */
export type BrandBindingClient = ReturnType<typeof BrandBinding.forConnection>;
