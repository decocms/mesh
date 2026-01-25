/**
 * Todo List Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_TODO = defineTool({
  name: "UI_TODO",
  description: "Display an interactive checklist/todo list",
  inputSchema: z.object({
    title: z.string().default("Tasks").describe("List title"),
    items: z
      .array(
        z.object({
          id: z.string().describe("Unique item ID"),
          text: z.string().describe("Item text"),
          completed: z.boolean().default(false).describe("Completion status"),
        }),
      )
      .describe("Todo items"),
  }),
  outputSchema: z.object({
    title: z.string(),
    total: z.number(),
    completed: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const completed = input.items.filter((i) => i.completed).length;
    return {
      title: input.title,
      total: input.items.length,
      completed,
      _meta: { "ui/resourceUri": "ui://mesh/todo" },
    };
  },
});
