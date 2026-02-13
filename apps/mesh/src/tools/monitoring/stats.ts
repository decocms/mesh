/**
 * MONITORING_STATS Tool
 *
 * Get aggregated statistics for monitoring logs.
 */

import { requireOrganization } from "@/core/mesh-context";
import { defineTool } from "../../core/define-tool";
import { z } from "zod";

export const MONITORING_STATS = defineTool({
  name: "MONITORING_STATS",
  description: "Get aggregated statistics for tool call monitoring",
  annotations: {
    title: "Get Monitoring Stats",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({
    startDate: z
      .string()
      .datetime()
      .optional()
      .describe("Filter by start date (ISO 8601 datetime string)"),
    endDate: z
      .string()
      .datetime()
      .optional()
      .describe("Filter by end date (ISO 8601 datetime string)"),
  }),
  outputSchema: z.object({
    totalCalls: z.number().describe("Total number of tool calls"),
    errorRate: z.number().describe("Error rate as a decimal (0 to 1)"),
    avgDurationMs: z.number().describe("Average call duration in milliseconds"),
    errorRatePercent: z.string().describe("Error rate as a percentage string"),
  }),
  handler: async (input, ctx) => {
    const org = requireOrganization(ctx);

    const filters = {
      organizationId: org.id,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    };

    const stats = await ctx.storage.monitoring.getStats(filters);

    return {
      ...stats,
      errorRatePercent: (stats.errorRate * 100).toFixed(2),
    };
  },
});
