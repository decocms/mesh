/**
 * Metric Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_METRIC = defineTool({
  name: "UI_METRIC",
  description:
    "Display a key metric with label, value, and optional trend indicator",
  inputSchema: z.object({
    label: z.string().describe("Metric label"),
    value: z.coerce.number().describe("The metric value"),
    unit: z
      .string()
      .optional()
      .describe("Unit of measurement (e.g., 'ms', 'GB', '$')"),
    trend: z.coerce
      .number()
      .optional()
      .describe("Trend percentage (positive = up, negative = down)"),
    description: z.string().optional().describe("Additional context"),
  }),
  outputSchema: z.object({
    label: z.string(),
    value: z.number(),
    unit: z.string().optional(),
    trend: z.number().optional(),
    description: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      label: input.label,
      value: input.value,
      unit: input.unit,
      trend: input.trend,
      description: input.description,
      _meta: { "ui/resourceUri": "ui://mesh/metric" },
    };
  },
});
