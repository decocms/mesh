/**
 * Switch Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_SWITCH = defineTool({
  name: "UI_SWITCH",
  description: "Display toggle switch with label",
  inputSchema: z.object({
    label: z.string().describe("Switch label"),
    description: z.string().optional().describe("Optional description"),
    checked: z.boolean().optional().describe("Initial checked state"),
  }),
  outputSchema: z.object({
    label: z.string(),
    description: z.string().optional(),
    checked: z.boolean().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      label: input.label,
      description: input.description,
      checked: input.checked,
      _meta: { "ui/resourceUri": "ui://mesh/switch" },
    };
  },
});
