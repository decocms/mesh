/**
 * Notification Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_NOTIFICATION = defineTool({
  name: "UI_NOTIFICATION",
  description: "Display a notification banner with icon and action",
  inputSchema: z.object({
    title: z.string().describe("Notification title"),
    message: z.string().describe("Notification message"),
    type: z
      .enum(["info", "success", "warning", "error"])
      .default("info")
      .describe("Notification type"),
    action: z.string().optional().describe("Optional action button text"),
    dismissible: z.boolean().default(true).describe("Can be dismissed"),
  }),
  outputSchema: z.object({
    title: z.string(),
    type: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      type: input.type,
      _meta: { "ui/resourceUri": "ui://mesh/notification" },
    };
  },
});
