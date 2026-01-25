/**
 * Progress Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_PROGRESS = defineTool({
  name: "UI_PROGRESS",
  description: "Display a visual progress bar with percentage and label",
  inputSchema: z.object({
    label: z.string().default("Progress").describe("Progress label"),
    value: z.coerce.number().describe("Current progress value"),
    total: z.coerce.number().default(100).describe("Total/max value"),
  }),
  outputSchema: z.object({
    label: z.string(),
    value: z.number(),
    total: z.number(),
    percent: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const percent = Math.round((input.value / input.total) * 100);
    return {
      label: input.label,
      value: input.value,
      total: input.total,
      percent,
      _meta: { "ui/resourceUri": "ui://mesh/progress" },
    };
  },
});
