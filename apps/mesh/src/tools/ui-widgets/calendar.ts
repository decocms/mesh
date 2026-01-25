/**
 * Calendar Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_CALENDAR = defineTool({
  name: "UI_CALENDAR",
  description: "Display a mini calendar",
  inputSchema: z.object({
    month: z.coerce.number().min(1).max(12).describe("Month (1-12)"),
    year: z.coerce.number().describe("Year"),
    selected: z.array(z.number()).optional().describe("Selected day numbers"),
    today: z.coerce.number().optional().describe("Today's day number"),
  }),
  outputSchema: z.object({
    month: z.number(),
    year: z.number(),
    selected: z.array(z.number()).optional(),
    today: z.number().optional(),
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
