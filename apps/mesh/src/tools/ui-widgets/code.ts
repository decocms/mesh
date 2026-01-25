/**
 * Code Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_CODE = defineTool({
  name: "UI_CODE",
  description: "Display a code snippet with syntax styling and copy button",
  inputSchema: z.object({
    code: z.string().describe("The code to display"),
    language: z
      .string()
      .default("javascript")
      .describe("Programming language for syntax hints"),
  }),
  outputSchema: z.object({
    language: z.string(),
    lines: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      language: input.language,
      lines: input.code.split("\n").length,
      _meta: { "ui/resourceUri": "ui://mesh/code" },
    };
  },
});
