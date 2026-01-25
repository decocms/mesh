/**
 * Skeleton Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_SKELETON = defineTool({
  name: "UI_SKELETON",
  description: "Display animated loading placeholder",
  inputSchema: z.object({
    variant: z
      .enum(["card", "list", "text"])
      .optional()
      .describe("Skeleton variant (default: card)"),
    lines: z.coerce
      .number()
      .optional()
      .describe("Number of lines for card/text variant"),
    items: z.coerce
      .number()
      .optional()
      .describe("Number of items for list variant"),
  }),
  outputSchema: z.object({
    variant: z.enum(["card", "list", "text"]).optional(),
    lines: z.number().optional(),
    items: z.number().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      variant: input.variant,
      lines: input.lines,
      items: input.items,
      _meta: { "ui/resourceUri": "ui://mesh/skeleton" },
    };
  },
});
