/**
 * Timer Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_TIMER = defineTool({
  name: "UI_TIMER",
  description: "Display an interactive timer with start/pause controls",
  inputSchema: z.object({
    seconds: z.coerce.number().default(0).describe("Initial seconds"),
    label: z.string().default("Timer").describe("Timer label"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      message: `Timer "${input.label}" started at ${input.seconds} seconds`,
      _meta: { "ui/resourceUri": "ui://mesh/timer" },
    };
  },
});
