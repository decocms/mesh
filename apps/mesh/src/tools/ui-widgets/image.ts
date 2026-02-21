/**
 * Image Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_IMAGE = defineTool({
  name: "UI_IMAGE",
  description: "Display an image with optional caption and zoom",
  inputSchema: z.object({
    src: z.string().describe("Image URL"),
    alt: z.string().optional().describe("Alt text for accessibility"),
    caption: z.string().optional().describe("Image caption"),
    aspectRatio: z
      .enum(["auto", "16:9", "4:3", "1:1"])
      .default("auto")
      .describe("Aspect ratio"),
  }),
  outputSchema: z.object({
    src: z.string(),
    caption: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      src: input.src,
      caption: input.caption,
      _meta: { "ui/resourceUri": "ui://mesh/image" },
    };
  },
});
