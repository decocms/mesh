/**
 * Sparkline Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_SPARKLINE = defineTool({
  name: "UI_SPARKLINE",
  description: "Display a compact inline trend chart with current value",
  inputSchema: z.object({
    label: z.string().optional().describe("Metric label"),
    value: z.string().describe("Current value to display"),
    data: z.array(z.coerce.number()).describe("Array of values for the chart"),
    trend: z.coerce.number().optional().describe("Trend percentage"),
  }),
  outputSchema: z.object({
    label: z.string().optional(),
    value: z.string(),
    dataPoints: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      label: input.label,
      value: input.value,
      dataPoints: input.data.length,
      _meta: { "ui/resourceUri": "ui://mesh/sparkline" },
    };
  },
});
