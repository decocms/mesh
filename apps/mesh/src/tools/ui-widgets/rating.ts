/**
 * Rating Widget Tool
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_RATING = defineTool({
  name: "UI_RATING",
  description: "Display star rating",
  inputSchema: z.object({
    rating: z.coerce.number().describe("Rating value (e.g., 4.5)"),
    max: z.coerce.number().optional().describe("Maximum stars (default: 5)"),
    reviews: z.coerce.number().optional().describe("Number of reviews"),
    label: z.string().optional().describe("Label text"),
  }),
  outputSchema: z.object({
    rating: z.number(),
    max: z.number().optional(),
    reviews: z.number().optional(),
    label: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      rating: input.rating,
      max: input.max,
      reviews: input.reviews,
      label: input.label,
      _meta: { "ui/resourceUri": "ui://mesh/rating" },
    };
  },
});
