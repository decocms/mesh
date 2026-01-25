/**
 * Avatar Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_AVATAR = defineTool({
  name: "UI_AVATAR",
  description: "Display user avatar with image, fallback initials, and status",
  inputSchema: z.object({
    name: z.string().describe("User's full name for initials fallback"),
    src: z.string().optional().describe("Avatar image URL"),
    role: z.string().optional().describe("User's role or title"),
    status: z
      .enum(["online", "offline", "busy", "away"])
      .optional()
      .describe("Status indicator"),
    size: z
      .enum(["sm", "md", "lg", "xl"])
      .optional()
      .describe("Avatar size (default: lg)"),
  }),
  outputSchema: z.object({
    name: z.string(),
    src: z.string().optional(),
    role: z.string().optional(),
    status: z.enum(["online", "offline", "busy", "away"]).optional(),
    size: z.enum(["sm", "md", "lg", "xl"]).optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      name: input.name,
      src: input.src,
      role: input.role,
      status: input.status,
      size: input.size,
      _meta: { "ui/resourceUri": "ui://mesh/avatar" },
    };
  },
});
