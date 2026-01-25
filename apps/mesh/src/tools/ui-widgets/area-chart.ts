/**
 * Area Chart Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

const dataPointSchema = z.object({
  label: z.string().describe("X-axis label"),
  value: z.number().describe("Y-axis value"),
});

export const UI_AREA_CHART = defineTool({
  name: "UI_AREA_CHART",
  description: "Display a beautiful area chart with gradient fill",
  inputSchema: z.object({
    title: z.string().describe("Chart title"),
    subtitle: z.string().optional().describe("Chart subtitle"),
    data: z.array(dataPointSchema).describe("Chart data points"),
    tabs: z.array(z.string()).optional().describe("Tab labels for filtering"),
    activeTab: z.coerce.number().optional().describe("Active tab index"),
  }),
  outputSchema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    data: z.array(dataPointSchema),
    tabs: z.array(z.string()).optional(),
    activeTab: z.number().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      subtitle: input.subtitle,
      data: input.data,
      tabs: input.tabs,
      activeTab: input.activeTab,
      _meta: { "ui/resourceUri": "ui://mesh/area-chart" },
    };
  },
});
