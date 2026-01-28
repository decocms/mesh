/**
 * Diff Viewer Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_DIFF = defineTool({
  name: "UI_DIFF",
  description:
    "Display a side-by-side or unified diff view for text comparison",
  inputSchema: z.object({
    before: z.string().describe("Original text"),
    after: z.string().describe("Modified text"),
    title: z.string().optional().describe("Diff title"),
    language: z.string().optional().describe("Language for syntax hints"),
  }),
  outputSchema: z.object({
    title: z.string().optional(),
    beforeLines: z.number(),
    afterLines: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      beforeLines: input.before.split("\n").length,
      afterLines: input.after.split("\n").length,
      _meta: { "ui/resourceUri": "ui://mesh/diff" },
    };
  },
});
