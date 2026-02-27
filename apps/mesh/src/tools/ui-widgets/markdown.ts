import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { defineTool } from "../../core/define-tool.ts";

export const UI_MARKDOWN = defineTool({
  name: "UI_MARKDOWN",
  description: "Display rendered markdown content",
  inputSchema: z.object({
    content: z.string().describe("Markdown content to render"),
    title: z.string().default("").describe("Optional title above the content"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const lines = input.content.split("\n").length;
    const prefix = input.title ? `Markdown "${input.title}"` : "Markdown";
    return {
      message: `${prefix}: ${lines} line${lines === 1 ? "" : "s"} of content`,
      _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/markdown" },
    };
  },
});
