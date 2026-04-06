/**
 * Organization Settings Schema
 *
 * Shared zod schemas for organization settings tools.
 * These schemas match the TypeScript interfaces defined in storage/types.ts
 */

import { z } from "zod";

/**
 * Sidebar item schema - matches SidebarItem interface from storage/types.ts
 */
export const SidebarItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  icon: z.string(),
});

export type SidebarItem = z.infer<typeof SidebarItemSchema>;

/**
 * Registry config schema - matches RegistryConfig interface from storage/types.ts
 *
 * Controls which registries are visible in the store and which individual MCPs are blocked.
 * When null/absent, defaults to Deco Store enabled with nothing blocked.
 */
export const RegistryConfigSchema = z.object({
  registries: z
    .record(z.string(), z.object({ enabled: z.boolean() }))
    .describe(
      "Per-registry enabled/disabled state. Key is connection ID. Absent registries are treated as enabled.",
    ),
  blockedMcps: z
    .array(z.string())
    .describe("List of MCP app_name or app_id values to hide from the store."),
});

export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

/**
 * Brand context schema - org-scoped company profile
 */
export const BrandContextSchema = z.object({
  name: z.string().describe("Company name"),
  domain: z.string().describe("Company domain (e.g. example.com)"),
  overview: z.string().describe("Company overview / description"),
  logo: z.string().nullable().optional().describe("Logo URL"),
  favicon: z.string().nullable().optional().describe("Favicon URL"),
  ogImage: z.string().nullable().optional().describe("OG image URL"),
  fonts: z
    .array(z.record(z.string(), z.unknown()))
    .nullable()
    .optional()
    .describe("Font configuration"),
  colors: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .describe("Color palette"),
  images: z
    .array(z.record(z.string(), z.unknown()))
    .nullable()
    .optional()
    .describe("Brand images"),
});

export type BrandContextInput = z.infer<typeof BrandContextSchema>;
