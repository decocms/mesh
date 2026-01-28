/**
 * Keyboard Shortcut Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

const shortcutSchema = z.object({
  keys: z.array(z.string()).describe("Array of key labels"),
  label: z.string().describe("Shortcut description"),
});

export const UI_KBD = defineTool({
  name: "UI_KBD",
  description: "Display keyboard shortcuts",
  inputSchema: z.object({
    shortcuts: z
      .array(shortcutSchema)
      .optional()
      .describe("Array of shortcuts"),
    keys: z.array(z.string()).optional().describe("Single shortcut keys"),
    label: z.string().optional().describe("Single shortcut label"),
  }),
  outputSchema: z.object({
    shortcuts: z.array(shortcutSchema).optional(),
    keys: z.array(z.string()).optional(),
    label: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      shortcuts: input.shortcuts,
      keys: input.keys,
      label: input.label,
      _meta: { "ui/resourceUri": "ui://mesh/kbd" },
    };
  },
});
