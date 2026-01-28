/**
 * Form Result Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_FORM_RESULT = defineTool({
  name: "UI_FORM_RESULT",
  description: "Display form submission results with field values",
  inputSchema: z.object({
    title: z.string().default("Form Submitted").describe("Result title"),
    fields: z
      .array(
        z.object({
          label: z.string().describe("Field label"),
          value: z.string().describe("Field value"),
        }),
      )
      .describe("Submitted field values"),
    status: z
      .enum(["success", "error", "pending"])
      .default("success")
      .describe("Submission status"),
  }),
  outputSchema: z.object({
    title: z.string(),
    fieldCount: z.number(),
    status: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      fieldCount: input.fields.length,
      status: input.status,
      _meta: { "ui/resourceUri": "ui://mesh/form-result" },
    };
  },
});
