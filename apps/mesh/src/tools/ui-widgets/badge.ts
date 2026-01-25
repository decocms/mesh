/**
 * Badge Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

const badgeSchema = z.object({
  text: z.string().describe("Badge text"),
  variant: z
    .enum([
      "default",
      "secondary",
      "destructive",
      "outline",
      "success",
      "warning",
    ])
    .optional()
    .describe("Badge variant"),
});

export const UI_BADGE = defineTool({
  name: "UI_BADGE",
  description: "Display badges with multiple variants for status and labels",
  inputSchema: z.object({
    badges: z.array(badgeSchema).optional().describe("Array of badges"),
    text: z.string().optional().describe("Single badge text"),
    variant: z
      .enum([
        "default",
        "secondary",
        "destructive",
        "outline",
        "success",
        "warning",
      ])
      .optional()
      .describe("Single badge variant"),
  }),
  outputSchema: z.object({
    badges: z.array(badgeSchema).optional(),
    text: z.string().optional(),
    variant: z
      .enum([
        "default",
        "secondary",
        "destructive",
        "outline",
        "success",
        "warning",
      ])
      .optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      badges: input.badges,
      text: input.text,
      variant: input.variant,
      _meta: { "ui/resourceUri": "ui://mesh/badge" },
    };
  },
});
