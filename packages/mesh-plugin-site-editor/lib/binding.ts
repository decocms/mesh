/**
 * Site Editor Binding
 *
 * Defines the minimal tool interface required for the site editor plugin.
 * Connections must provide read_file, write_file, and list_directory tools
 * for page CRUD operations. BLOCKS_LIST/LOADERS_LIST (DECO_BLOCKS_BINDING)
 * are optional — the block catalog gracefully degrades without them.
 */

import { z } from "zod";
import type { Binder } from "@decocms/bindings";

export const SITE_EDITOR_BINDING = [
  {
    name: "read_file" as const,
    inputSchema: z.object({
      path: z.string(),
    }),
  },
  {
    name: "write_file" as const,
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
    }),
  },
  {
    name: "list_directory" as const,
    inputSchema: z.object({
      path: z.string(),
    }),
  },
] as const satisfies Binder;

export type SiteEditorBinding = typeof SITE_EDITOR_BINDING;
