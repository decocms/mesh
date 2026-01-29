/**
 * Error Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_ERROR = defineTool({
  name: "UI_ERROR",
  description: "Display an error message with details and optional stack trace",
  inputSchema: z.object({
    title: z.string().default("Error").describe("Error title"),
    message: z.string().describe("Error message"),
    details: z.string().optional().describe("Additional error details"),
    code: z.string().optional().describe("Error code"),
    stack: z.string().optional().describe("Stack trace"),
  }),
  outputSchema: z.object({
    title: z.string(),
    message: z.string(),
    code: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      message: input.message,
      code: input.code,
      _meta: { "ui/resourceUri": "ui://mesh/error" },
    };
  },
});
