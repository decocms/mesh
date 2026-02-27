import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { defineTool } from "../../core/define-tool.ts";

export const UI_TODO = defineTool({
  name: "UI_TODO",
  description: "Display an interactive todo list",
  inputSchema: z.object({
    items: z
      .array(
        z.object({
          text: z.string().describe("Todo item text"),
          completed: z
            .boolean()
            .default(false)
            .describe("Whether the item is completed"),
        }),
      )
      .default([])
      .describe("List of todo items"),
    title: z.string().default("Todo").describe("Title for the todo list"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const done = input.items.filter((i) => i.completed).length;
    return {
      message: `Todo "${input.title}": ${done}/${input.items.length} completed`,
      _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/todo" },
    };
  },
});
