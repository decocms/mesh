import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { defineTool } from "../../core/define-tool.ts";

export const UI_PROGRESS = defineTool({
  name: "UI_PROGRESS",
  description: "Display a visual progress bar with label and percentage",
  inputSchema: z.object({
    value: z.coerce.number().default(0).describe("Current progress value"),
    max: z.coerce.number().default(100).describe("Maximum progress value"),
    label: z
      .string()
      .default("Progress")
      .describe("Label for the progress bar"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const pct = input.max > 0 ? Math.round((input.value / input.max) * 100) : 0;
    return {
      message: `${input.label}: ${input.value}/${input.max} (${pct}%)`,
      _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/progress" },
    };
  },
});
