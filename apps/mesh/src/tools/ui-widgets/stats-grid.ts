/**
 * Stats Grid Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

const statSchema = z.object({
  label: z.string().describe("Stat label"),
  value: z.string().describe("Stat value (formatted)"),
  trend: z.number().optional().describe("Trend percentage"),
  trendLabel: z.string().optional().describe("Trend description"),
});

export const UI_STATS_GRID = defineTool({
  name: "UI_STATS_GRID",
  description: "Display a grid of metric cards like a dashboard",
  inputSchema: z.object({
    stats: z.array(statSchema).describe("Array of stats to display"),
  }),
  outputSchema: z.object({
    stats: z.array(statSchema),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      stats: input.stats,
      _meta: { "ui/resourceUri": "ui://mesh/stats-grid" },
    };
  },
});
