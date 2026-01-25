/**
 * Greeting Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_GREETING = defineTool({
  name: "UI_GREETING",
  description: "Display a personalized greeting in an elegant animated card",
  inputSchema: z.object({
    name: z.string().describe("Name to greet"),
    message: z.string().optional().describe("Optional custom message"),
  }),
  outputSchema: z.object({
    greeting: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    const greeting = input.message
      ? `Hello ${input.name}! ${input.message}`
      : `Hello ${input.name}!`;
    return {
      greeting,
      _meta: { "ui/resourceUri": "ui://mesh/greeting" },
    };
  },
});
