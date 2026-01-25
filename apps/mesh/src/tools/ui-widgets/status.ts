/**
 * Status Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_STATUS = defineTool({
  name: "UI_STATUS",
  description: "Display a status badge with colored indicator",
  inputSchema: z.object({
    status: z.string().describe("Status text"),
    description: z.string().optional().describe("Additional details"),
    type: z
      .enum(["success", "warning", "error", "info"])
      .default("success")
      .describe("Status type for color coding"),
    timestamp: z.string().optional().describe("Timestamp text"),
  }),
  outputSchema: z.object({
    status: z.string(),
    type: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      status: input.status,
      type: input.type,
      _meta: { "ui/resourceUri": "ui://mesh/status" },
    };
  },
});
