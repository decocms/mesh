/**
 * JSON Viewer Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_JSON_VIEWER = defineTool({
  name: "UI_JSON_VIEWER",
  description:
    "Display JSON data with collapsible tree view and syntax highlighting",
  inputSchema: z.object({
    data: z.unknown().describe("JSON data to display"),
    title: z.string().optional().describe("Optional title"),
    collapsed: z.boolean().default(false).describe("Start with tree collapsed"),
  }),
  outputSchema: z.object({
    title: z.string().optional(),
    size: z.number(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const jsonStr = JSON.stringify(input.data);
    return {
      title: input.title,
      size: jsonStr.length,
      _meta: { "ui/resourceUri": "ui://mesh/json-viewer" },
    };
  },
});
