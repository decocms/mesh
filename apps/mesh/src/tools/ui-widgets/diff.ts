import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { defineTool } from "../../core/define-tool.ts";

export const UI_DIFF = defineTool({
  name: "UI_DIFF",
  description: "Display a side-by-side text diff viewer",
  inputSchema: z.object({
    before: z.string().describe("Original text content"),
    after: z.string().describe("Modified text content"),
    title: z.string().default("Diff").describe("Title for the diff viewer"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const beforeLines = input.before.split("\n").length;
    const afterLines = input.after.split("\n").length;
    return {
      message: `Diff "${input.title}": ${beforeLines} → ${afterLines} lines`,
      _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/diff" },
    };
  },
});
