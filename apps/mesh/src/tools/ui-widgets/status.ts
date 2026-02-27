import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { defineTool } from "../../core/define-tool.ts";

export const UI_STATUS = defineTool({
  name: "UI_STATUS",
  description: "Display a status badge indicator",
  inputSchema: z.object({
    status: z
      .enum(["online", "offline", "busy", "away"])
      .describe("Current status"),
    label: z.string().describe("Label for the status badge"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      message: `Status "${input.label}": ${input.status}`,
      _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/status" },
    };
  },
});
