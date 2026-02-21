/**
 * Calendar Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_CALENDAR = defineTool({
  name: "UI_CALENDAR",
  description: "Display a mini calendar",
  inputSchema: z.object({
    month: z.coerce.number().int().min(1).max(12).describe("Month (1-12)"),
    year: z.coerce.number().int().describe("Year"),
    selected: z
      .array(z.coerce.number().int())
      .optional()
      .describe("Selected day numbers"),
    today: z.coerce.number().int().optional().describe("Today's day number"),
  }),
  outputSchema: z.object({
    month: z.number().int(),
    year: z.number().int(),
    selected: z.array(z.number().int()).optional(),
    today: z.number().int().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      month: input.month,
      year: input.year,
      selected: input.selected,
      today: input.today,
      _meta: { "ui/resourceUri": "ui://mesh/calendar" },
    };
  },
});
