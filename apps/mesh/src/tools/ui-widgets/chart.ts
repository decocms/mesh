/**
 * Chart Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_CHART = defineTool({
  name: "UI_CHART",
  description: "Display data as an animated bar chart",
  inputSchema: z.object({
    title: z.string().default("Chart").describe("Chart title"),
    data: z
      .array(
        z.object({
          label: z.string(),
          value: z.coerce.number(),
        }),
      )
      .describe("Data points with label and value"),
  }),
  outputSchema: z.object({
    title: z.string(),
    dataPoints: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      dataPoints: input.data.length,
      _meta: { "ui/resourceUri": "ui://mesh/chart" },
    };
  },
});
