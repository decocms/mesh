/**
 * Quote Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_QUOTE = defineTool({
  name: "UI_QUOTE",
  description: "Display a quote with attribution in an elegant card",
  inputSchema: z.object({
    text: z.string().describe("The quote text"),
    author: z.string().optional().describe("Quote attribution"),
  }),
  outputSchema: z.object({
    text: z.string(),
    author: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      text: input.text,
      author: input.author,
      _meta: { "ui/resourceUri": "ui://mesh/quote" },
    };
  },
});
