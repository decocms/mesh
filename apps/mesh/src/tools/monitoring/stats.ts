/**
 * MONITORING_STATS Tool
 *
 * Get aggregated statistics for monitoring logs.
 * Supports both summary stats (backward-compatible) and timeseries queries.
 */

import { requireOrganization } from "@/core/mesh-context";
import { flushMonitoringData } from "@/observability";
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
    interval: z
      .enum(["1m", "1h", "1d"])
      .optional()
      .describe(
        "Bucket interval for timeseries data. When provided, returns timeseries array.",
      ),
    toolNames: z
      .array(z.string())
      .max(100)
      .optional()
      .describe("Filter by specific tool names (max 100)"),
  }),
  outputSchema: z.object({
    totalCalls: z.number().describe("Total number of tool calls"),
    errorRate: z
      .number()
      .optional()
      .describe("Error rate as a decimal (0 to 1)"),
    avgDurationMs: z.number().describe("Average call duration in milliseconds"),
    errorRatePercent: z
      .string()
      .optional()
      .describe("Error rate as a percentage string"),
    totalErrors: z.number().optional().describe("Total number of errors"),
    p50DurationMs: z
      .number()
      .optional()
      .describe("50th percentile duration in milliseconds"),
    p95DurationMs: z
      .number()
      .optional()
      .describe("95th percentile duration in milliseconds"),
    timeseries: z
      .array(
        z.object({
          timestamp: z.string(),
          calls: z.number(),
          errors: z.number(),
          errorRate: z.number(),
          avg: z.number(),
          p50: z.number(),
          p95: z.number(),
        }),
      )
      .optional()
      .describe("Timeseries data points bucketed by interval"),
  }),
  handler: async (input, ctx) => {
    const org = requireOrganization(ctx);
    await ctx.access.check();
    await flushMonitoringData();

    if (input.interval) {
      return ctx.storage.monitoring.queryMetricTimeseries({
        organizationId: org.id,
        interval: input.interval,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        filters: { toolNames: input.toolNames },
      });
    }

    // Backward-compatible path
    const stats = await ctx.storage.monitoring.getStats({
      organizationId: org.id,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    });
    return { ...stats, errorRatePercent: (stats.errorRate * 100).toFixed(2) };
  },
});
