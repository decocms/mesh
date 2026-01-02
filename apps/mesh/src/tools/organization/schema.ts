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
