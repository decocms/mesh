/**
 * Confirmation Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_CONFIRMATION = defineTool({
  name: "UI_CONFIRMATION",
  description: "Display a confirmation dialog with accept/cancel actions",
  inputSchema: z.object({
    title: z.string().describe("Confirmation title"),
    message: z.string().describe("Confirmation message"),
    confirmLabel: z.string().default("Confirm").describe("Confirm button text"),
    cancelLabel: z.string().default("Cancel").describe("Cancel button text"),
    variant: z
      .enum(["default", "destructive"])
      .default("default")
      .describe("Style variant"),
  }),
  outputSchema: z.object({
    title: z.string(),
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      title: input.title,
      message: input.message,
      _meta: { "ui/resourceUri": "ui://mesh/confirmation" },
    };
  },
});
