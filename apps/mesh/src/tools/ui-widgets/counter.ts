/**
 * Counter Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_COUNTER = defineTool({
  name: "UI_COUNTER",
  description:
    "Display an interactive counter widget with increment/decrement controls",
  inputSchema: z.object({
    initialValue: z.coerce
      .number()
      .default(0)
      .describe("Initial counter value"),
    label: z.string().default("Counter").describe("Label for the counter"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      message: `Counter "${input.label}" initialized at ${input.initialValue}`,
      _meta: { "ui/resourceUri": "ui://mesh/counter" },
    };
  },
});
