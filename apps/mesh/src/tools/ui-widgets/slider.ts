/**
 * Slider Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_SLIDER = defineTool({
  name: "UI_SLIDER",
  description: "Display range slider with value",
  inputSchema: z.object({
    label: z.string().describe("Slider label"),
    value: z.coerce.number().describe("Current value"),
    min: z.coerce.number().optional().describe("Minimum value (default: 0)"),
    max: z.coerce.number().optional().describe("Maximum value (default: 100)"),
    step: z.coerce.number().optional().describe("Step increment (default: 1)"),
  }),
  outputSchema: z.object({
    label: z.string(),
    value: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      label: input.label,
      value: input.value,
      min: input.min,
      max: input.max,
      step: input.step,
      _meta: { "ui/resourceUri": "ui://mesh/slider" },
    };
  },
});
