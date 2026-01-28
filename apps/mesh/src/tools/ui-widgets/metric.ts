/**
 * Metric Widget Tool
 *
 * Displays a beautiful metric card with value, trend badge, and description.
 * Inspired by shadcn/ui dashboard cards.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_METRIC = defineTool({
  name: "UI_METRIC",
  description:
    "Display a beautiful metric card with value, trend badge, and description",
  inputSchema: z.object({
    label: z.string().describe("Metric label (e.g., 'Total Revenue')"),
    value: z
      .string()
      .describe("The metric value, can be formatted (e.g., '$1,250.00')"),
    trend: z.coerce
      .number()
      .optional()
      .describe("Trend percentage (positive = up, negative = down)"),
    trendLabel: z
      .string()
      .optional()
      .describe("Trend description (e.g., 'Trending up this month')"),
    description: z
      .string()
      .optional()
      .describe("Additional context below the metric"),
  }),
  outputSchema: z.object({
    label: z.string(),
    value: z.string(),
    trend: z.number().optional(),
    trendLabel: z.string().optional(),
    description: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      label: input.label,
      value: input.value,
      trend: input.trend,
      trendLabel: input.trendLabel,
      description: input.description,
      _meta: { "ui/resourceUri": "ui://mesh/metric" },
    };
  },
});
