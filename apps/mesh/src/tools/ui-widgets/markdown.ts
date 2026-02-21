/**
 * Markdown Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_MARKDOWN = defineTool({
  name: "UI_MARKDOWN",
  description: "Display rendered markdown content with proper formatting",
  inputSchema: z.object({
    content: z.string().describe("Markdown content to render"),
    title: z.string().optional().describe("Optional title"),
  }),
  outputSchema: z.object({
    title: z.string().optional(),
    length: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      length: input.content.length,
      _meta: { "ui/resourceUri": "ui://mesh/markdown" },
    };
  },
});
